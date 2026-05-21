const express = require("express");
const multer = require("multer");
const fs = require("fs");
const xml2js = require("xml2js");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

const PART_CLASSES = ["Part", "MeshPart", "WedgePart", "CornerWedgePart", "TrussPart"];

const UI_CLASSES = [
  "ScreenGui",
  "Frame",
  "TextLabel",
  "TextButton",
  "ImageLabel",
  "ImageButton"
];

const SCRIPT_CLASSES = [
  "Script",
  "LocalScript",
  "ModuleScript"
];

function getProp(item, name) {
  if (!item.Properties || !item.Properties[0]) return null;

  const props = item.Properties[0];

  for (const type in props) {
    for (const prop of props[type]) {
      if (prop.$ && prop.$.name === name) {
        return { type, value: prop };
      }
    }
  }

  return null;
}

function rawValue(prop) {
  if (!prop) return null;
  const v = prop.value;

  if (Array.isArray(v)) return v[0];
  if (v && typeof v === "object" && "_" in v) return v._;

  return v;
}

function readNumber(v, fallback = 0) {
  if (Array.isArray(v)) v = v[0];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readString(prop, fallback = "") {
  const v = rawValue(prop);
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function readBool(prop, fallback = false) {
  const v = rawValue(prop);
  if (v === null || v === undefined) return fallback;
  return v === true || v === "true";
}

function readFloat(prop, fallback = 0) {
  const v = rawValue(prop);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readVector3(prop) {
  if (!prop) return { x: 0, y: 0, z: 0 };

  const v = prop.value;

  return {
    x: readNumber(v.X),
    y: readNumber(v.Y),
    z: readNumber(v.Z)
  };
}

function readCFrame(prop) {
  if (!prop) return null;

  const v = prop.value;

  return {
    position: {
      x: readNumber(v.X),
      y: readNumber(v.Y),
      z: readNumber(v.Z)
    },
    rotation: {
      r00: readNumber(v.R00, 1),
      r01: readNumber(v.R01, 0),
      r02: readNumber(v.R02, 0),

      r10: readNumber(v.R10, 0),
      r11: readNumber(v.R11, 1),
      r12: readNumber(v.R12, 0),

      r20: readNumber(v.R20, 0),
      r21: readNumber(v.R21, 0),
      r22: readNumber(v.R22, 1)
    }
  };
}

function readColor(prop, fallback = "rgb(153,153,153)") {
  if (!prop) return fallback;

  const type = prop.type;
  const v = prop.value;

  if (type === "Color3") {
    const r = Math.round(readNumber(v.R, 0) * 255);
    const g = Math.round(readNumber(v.G, 0) * 255);
    const b = Math.round(readNumber(v.B, 0) * 255);
    return `rgb(${r},${g},${b})`;
  }

  if (type === "Color3uint8") {
    const raw = rawValue(prop);
    const num = Number(raw || 0);

    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;

    return `rgb(${r},${g},${b})`;
  }

  return fallback;
}
function readUDim2(prop) {
  if (!prop) {
    return {
      xScale: 0,
      xOffset: 0,
      yScale: 0,
      yOffset: 0
    };
  }

  const v = prop.value;

  return {
    xScale: readNumber(v.XS || v.XScale, 0),
    xOffset: readNumber(v.XO || v.XOffset, 0),
    yScale: readNumber(v.YS || v.YScale, 0),
    yOffset: readNumber(v.YO || v.YOffset, 0)
  };
}

function scanItems(items, parts, ui, parentId = null) {
  if (!items) return;

  for (const item of items) {
    const className = item.$?.class;
    const id = item.$?.referent || Math.random().toString(36).slice(2);

if (SCRIPT_CLASSES.includes(className)) {
  const source = readString(getProp(item, "Source"), "");

  ui.push({
    id,
    parentId,
    className,
    name: readString(getProp(item, "Name"), className),
    source,
    disabled: readBool(getProp(item, "Disabled"), false)
  });
}

    if (PART_CLASSES.includes(className)) {
      const sizeProp = getProp(item, "size") || getProp(item, "Size");
      const posProp = getProp(item, "Position");
      const cfProp = getProp(item, "CFrame");

      const cframe = readCFrame(cfProp);
      const position = cframe ? cframe.position : readVector3(posProp);
      const rotation = cframe ? cframe.rotation : null;

      parts.push({
        id,
        className,
        name: readString(getProp(item, "Name"), className),
        size: readVector3(sizeProp),
        position,
        rotation,
        color: readColor(getProp(item, "Color3uint8") || getProp(item, "Color")),
        material: readString(getProp(item, "Material"), "Plastic"),
        transparency: readFloat(getProp(item, "Transparency"), 0),
        reflectance: readFloat(getProp(item, "Reflectance"), 0),
        anchored: readBool(getProp(item, "Anchored"), true),
        canCollide: readBool(getProp(item, "CanCollide"), true)
      });
    }

    if (UI_CLASSES.includes(className)) {
      ui.push({
        id,
        parentId,
        className,
        name: readString(getProp(item, "Name"), className),
        text: readString(getProp(item, "Text"), ""),
        visible: readBool(getProp(item, "Visible"), true),

        position: readUDim2(getProp(item, "Position")),
        size: readUDim2(getProp(item, "Size")),

        backgroundColor: readColor(getProp(item, "BackgroundColor3"), "rgba(0,0,0,0)"),
borderColor: readColor(getProp(item, "BorderColor3"), "rgb(0,0,0)"),
textColor: readColor(getProp(item, "TextColor3"), "rgb(255,255,255)"),
imageColor: readColor(getProp(item, "ImageColor3"), "rgb(255,255,255)"),

borderSizePixel: readFloat(getProp(item, "BorderSizePixel"), 0),
rotation: readFloat(getProp(item, "Rotation"), 0),
zIndex: readFloat(getProp(item, "ZIndex"), 1),

        backgroundTransparency: readFloat(getProp(item, "BackgroundTransparency"), 0),
        textTransparency: readFloat(getProp(item, "TextTransparency"), 0),

        textSize: readFloat(getProp(item, "TextSize"), 18),
        image: readString(getProp(item, "Image"), "")
      });
    }

    if (item.Item) {
      scanItems(item.Item, parts, ui, id);
    }
  }
}

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded."
      });
    }

const originalName = req.file.originalname.toLowerCase();

if (originalName.endsWith(".json") || originalName.endsWith(".playsculpt.json")) {
  const raw = fs.readFileSync(req.file.path, "utf8");
  const data = JSON.parse(raw);

  fs.unlinkSync(req.file.path);

  return res.json({
    success: true,
    importType: "playsculpt-json",
    partCount: data.parts?.length || 0,
    meshCount: data.meshes?.length || 0,
    uiCount: data.ui?.length || 0,
    scriptCount: data.scripts?.length || 0,
    parts: data.parts || [],
    meshes: data.meshes || [],
    ui: data.ui || [],
    scripts: data.scripts || []
  });
}

    const xml = fs.readFileSync(req.file.path, "utf8");

    const parsed = await xml2js.parseStringPromise(xml, {
      explicitArray: true,
      mergeAttrs: false
    });

    const parts = [];
    const ui = [];

    if (parsed.roblox && parsed.roblox.Item) {
      scanItems(parsed.roblox.Item, parts, ui);
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      partCount: parts.length,
      uiCount: ui.length,
      parts,
      ui
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(3000, () => {
  console.log("Running on http://localhost:3000");
});