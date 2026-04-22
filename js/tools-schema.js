/**
 * JSON Schema for tools provided to LLMs (Ollama / Gemini) via function calling.
 *
 * 設計方針:
 *   - 自然言語の意図に近いエゴセントリックなツールを優先（move_relative, turn, move_to_landmark）
 *   - 精密制御が必要なときのみ座標系の move_to / move_path を使う
 *   - think ツールは廃止（テキスト応答に計画を書かせる）
 */

const toioTools = [
    {
      "type": "function",
      "function": {
        "name": "move_relative",
        "description": "Move the cube in a direction by a preset distance. PREFERRED for natural language movement commands. 'forward'/'backward' are relative to the cube's current facing. 'right'/'left'/'up'/'down' are absolute mat directions (right=+X, left=-X, up=-Y, down=+Y). After moving in an absolute direction the cube faces that direction; 'forward'/'backward' preserve the facing.",
        "parameters": {
          "type": "object",
          "properties": {
            "direction": {
              "type": "string",
              "enum": ["forward", "backward", "right", "left", "up", "down"]
            },
            "distance": {
              "type": "string",
              "enum": ["small", "medium", "large"],
              "description": "Preset distance. small≈30mm, medium≈70mm, large≈130mm. Defaults to medium.",
              "default": "medium"
            },
            "distance_mm": {
              "type": "integer",
              "description": "Optional explicit distance in millimeters. Overrides 'distance' when provided.",
              "minimum": 1,
              "maximum": 300
            }
          },
          "required": ["direction"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "turn",
        "description": "Rotate the cube in place without moving. Positive degrees = clockwise (seen from above), negative = counter-clockwise. 90=quarter turn, 180=half turn, 360=full rotation ending at the original heading.",
        "parameters": {
          "type": "object",
          "properties": {
            "degrees": {
              "type": "integer",
              "description": "Rotation amount. Range -360 to 360.",
              "minimum": -360,
              "maximum": 360
            }
          },
          "required": ["degrees"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "move_to_landmark",
        "description": "Move to a named landmark on the mat. Use this for intents like '中央に行って' / 'go to the top-right'. The cube's facing angle is preserved unless 'face' is specified.",
        "parameters": {
          "type": "object",
          "properties": {
            "landmark": {
              "type": "string",
              "enum": ["center", "top", "bottom", "left", "right",
                       "top-left", "top-right", "bottom-left", "bottom-right"]
            },
            "face": {
              "type": "integer",
              "description": "Optional final facing angle (0-359). If omitted, keeps current facing.",
              "minimum": 0,
              "maximum": 359
            }
          },
          "required": ["landmark"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "learn_calibration",
        "description": "Remember that a user's ambiguous word maps to a concrete value. Use this when you infer a user-specific vocabulary — e.g. 'ちょっと' means distance 20mm, 'ホーム' means position (250,250). Persists across sessions and is shown back to you at the start of every new task.",
        "parameters": {
          "type": "object",
          "properties": {
            "word": {
              "type": "string",
              "description": "The user's original word or phrase."
            },
            "meaning": {
              "type": "string",
              "description": "Concrete resolution. E.g. 'distance: 20mm', 'position: x=250 y=250', 'direction: east', 'light: rgb(0,255,255)'."
            }
          },
          "required": ["word", "meaning"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "move_to",
        "description": "Move to an absolute coordinate (x, y) on the mat then rotate to 'angle'. Use this only when a precise coordinate is known (e.g. after get_position, or echoing a known landmark). Prefer move_relative or move_to_landmark for natural-language commands. If the result contains 'warning', the target was not reached — retry with an adjusted target.",
        "parameters": {
          "type": "object",
          "properties": {
            "x": { "type": "integer" },
            "y": { "type": "integer" },
            "angle": {
                "type": "integer",
                "description": "Final facing angle (0-359). 0=right, 90=down, 180=left, 270=up.",
                "default": 0
            }
          },
          "required": ["x", "y"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "move_path",
        "description": "Move along multiple waypoints in order. Use when the user wants a specific trajectory ('describe a square', 'zigzag').",
        "parameters": {
          "type": "object",
          "properties": {
            "waypoints": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "x": { "type": "integer" },
                  "y": { "type": "integer" }
                },
                "required": ["x", "y"]
              }
            }
          },
          "required": ["waypoints"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "spin",
        "description": "Spin continuously in place for a duration. Use for 'dance' / 'twirl' style requests. For precise quarter/half turns prefer turn().",
        "parameters": {
          "type": "object",
          "properties": {
            "direction": { "type": "string", "enum": ["cw", "ccw"] },
            "duration_ms": { "type": "integer", "minimum": 500, "maximum": 2500 },
            "speed": { "type": "integer", "minimum": 0, "maximum": 100, "description": "Default 80." }
          },
          "required": ["direction", "duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "stop",
        "description": "Stop all movement immediately.",
        "parameters": { "type": "object", "properties": {} }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "wait",
        "description": "Pause for N milliseconds.",
        "parameters": {
          "type": "object",
          "properties": {
            "duration_ms": { "type": "integer", "minimum": 100, "maximum": 5000 }
          },
          "required": ["duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "set_light",
        "description": "Set the LED color.",
        "parameters": {
          "type": "object",
          "properties": {
            "red":   { "type": "integer", "minimum": 0, "maximum": 255 },
            "green": { "type": "integer", "minimum": 0, "maximum": 255 },
            "blue":  { "type": "integer", "minimum": 0, "maximum": 255 },
            "duration_ms": {
              "type": "integer",
              "description": "0 = stay on until changed.",
              "minimum": 0, "maximum": 2500
            }
          },
          "required": ["red", "green", "blue"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "set_light_pattern",
        "description": "Play an animated multi-color light pattern. repetitions=0 = infinite (until next light command). Can be called in parallel with spin/move.",
        "parameters": {
          "type": "object",
          "properties": {
            "repetitions": { "type": "integer", "default": 1 },
            "frames": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "duration_ms": { "type": "integer" },
                  "red":   { "type": "integer", "minimum": 0, "maximum": 255 },
                  "green": { "type": "integer", "minimum": 0, "maximum": 255 },
                  "blue":  { "type": "integer", "minimum": 0, "maximum": 255 }
                },
                "required": ["duration_ms", "red", "green", "blue"]
              }
            }
          },
          "required": ["frames"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "play_sound",
        "description": "Play a single MIDI note. 60=C4, 62=D4, 64=E4, 65=F4, 67=G4.",
        "parameters": {
          "type": "object",
          "properties": {
            "note_id":     { "type": "integer", "minimum": 0, "maximum": 127, "default": 60 },
            "duration_ms": { "type": "integer", "minimum": 100, "maximum": 2500 }
          },
          "required": ["duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "play_melody",
        "description": "Play a sequence of MIDI notes. Max 59 notes.",
        "parameters": {
          "type": "object",
          "properties": {
            "notes": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "note":        { "type": "integer", "minimum": 0, "maximum": 127 },
                  "duration_ms": { "type": "integer", "minimum": 10, "maximum": 2500 }
                },
                "required": ["note", "duration_ms"]
              }
            }
          },
          "required": ["notes"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "get_position",
        "description": "Get the cube's current position, angle and landmark area.",
        "parameters": { "type": "object", "properties": {} }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "get_battery",
        "description": "Get current battery percentage (0-100).",
        "parameters": { "type": "object", "properties": {} }
      }
    }
];

/**
 * Tools exposed to the agent loop. Keep all — the LLM picks the right abstraction.
 */
const agentTools = toioTools;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toioTools, agentTools };
}
