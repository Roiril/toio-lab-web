/**
 * JSON Schema for tools provided to Gemma4 via Ollama
 */

const toioTools = [
    {
      "type": "function",
      "function": {
        "name": "think",
        "description": "Think step-by-step before taking an action. Use this to plan complex sequences or reason about spatial constraints.",
        "parameters": {
          "type": "object",
          "properties": {
            "thought": {
              "type": "string",
              "description": "Your internal reasoning or plan."
            }
          },
          "required": ["thought"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "get_position",
        "description": "Get the current position of the toio cube, and spatial layout info (margins to the edge of the mat).",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "wait",
        "description": "Wait for a specified number of milliseconds before doing nothing.",
        "parameters": {
          "type": "object",
          "properties": {
            "duration_ms": {
              "type": "integer",
              "description": "Duration to wait in milliseconds.",
              "minimum": 100,
              "maximum": 5000
            }
          },
          "required": ["duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "stop",
        "description": "Stop all movement of the toio cube immediately.",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "play_melody",
        "description": "Play a sequence of musical notes on the toio cube.",
        "parameters": {
          "type": "object",
          "properties": {
            "notes": {
              "type": "array",
              "description": "Array of notes to play. Max 59 notes.",
              "items": {
                "type": "object",
                "properties": {
                  "note": {
                    "type": "integer",
                    "description": "MIDI Note ID (e.g. 60=C4, 62=D4).",
                    "minimum": 0,
                    "maximum": 127
                  },
                  "duration_ms": {
                    "type": "integer",
                    "description": "Duration to play this note in milliseconds.",
                    "minimum": 10,
                    "maximum": 2500
                  }
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
        "name": "move_path",
        "description": "Move the toio cube along a path of multiple coordinates sequentially.",
        "parameters": {
          "type": "object",
          "properties": {
            "waypoints": {
              "type": "array",
              "description": "Array of coordinates to visit in order.",
              "items": {
                "type": "object",
                "properties": {
                  "x": { "type": "integer", "description": "Target X coordinate." },
                  "y": { "type": "integer", "description": "Target Y coordinate." }
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
        "name": "set_light_pattern",
        "description": "Play an animated light pattern with multiple colors on the toio cube.",
        "parameters": {
          "type": "object",
          "properties": {
            "repetitions": {
              "type": "integer",
              "description": "Number of times to repeat the pattern. 0 = infinite loop (stays on until another light command). Defaults to 1.",
              "default": 1
            },
            "frames": {
              "type": "array",
              "description": "Sequence of light frames. Max 29 frames.",
              "items": {
                "type": "object",
                "properties": {
                  "duration_ms": { "type": "integer", "description": "Duration for this color in ms." },
                  "red": { "type": "integer", "minimum": 0, "maximum": 255 },
                  "green": { "type": "integer", "minimum": 0, "maximum": 255 },
                  "blue": { "type": "integer", "minimum": 0, "maximum": 255 }
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
        "name": "spin",
        "description": "Spin the cube around its center. Useful when asked to 'spin', 'twirl', or 'do a dance'. Can be called after set_light_pattern to spin while the light is on.",
        "parameters": {
          "type": "object",
          "properties": {
            "direction": {
              "type": "string",
              "enum": ["cw", "ccw"],
              "description": "Clockwise (cw) or Counter-Clockwise (ccw)."
            },
            "duration_ms": {
              "type": "integer",
              "description": "Duration to spin in milliseconds.",
              "minimum": 500,
              "maximum": 2500
            },
            "speed": {
              "type": "integer",
              "description": "Spin speed 0-100. Defaults to 80 if omitted.",
              "minimum": 0,
              "maximum": 100
            }
          },
          "required": ["direction", "duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "set_light",
        "description": "Change the color of the LED on the toio cube.",
        "parameters": {
          "type": "object",
          "properties": {
            "red": { "type": "integer", "minimum": 0, "maximum": 255 },
            "green": { "type": "integer", "minimum": 0, "maximum": 255 },
            "blue": { "type": "integer", "minimum": 0, "maximum": 255 },
            "duration_ms": {
              "type": "integer",
              "description": "How long the light should stay on. Use 0 for infinite (until changed).",
              "minimum": 0,
              "maximum": 2500
            }
          },
          "required": ["red", "green", "blue"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "play_sound",
        "description": "Play a sound note on the toio cube. Use this when asked to 'speak', 'beep', or 'make a sound'.",
        "parameters": {
          "type": "object",
          "properties": {
            "note_id": {
              "type": "integer",
              "description": "MIDI Note ID. 60=C4, 62=D4, 64=E4, 65=F4, 67=G4. Default is 60.",
              "minimum": 0,
              "maximum": 127
            },
            "duration_ms": {
              "type": "integer",
              "description": "Duration in milliseconds.",
              "minimum": 100,
              "maximum": 2500
            }
          },
          "required": ["duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "get_battery",
        "description": "Get the current battery percentage of the toio cube. Returns an integer 0-100.",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "move_to",
        "description": "Move the toio cube to a specific absolute coordinate (x, y) on the mat, then rotate to the specified angle. Movement is sequential: (1) rotate in place to face the target, (2) move straight to the target, (3) rotate in place to the final angle. If the result contains a 'warning' field, the target was not reached — call move_to again.",
        "parameters": {
          "type": "object",
          "properties": {
            "x": { "type": "integer", "description": "Target X coordinate on the mat." },
            "y": { "type": "integer", "description": "Target Y coordinate on the mat." },
            "angle": {
                "type": "integer",
                "description": "Target facing angle in degrees (0-360). 0=right(+X), 90=down(+Y), 180=left(-X), 270=up(-Y). Defaults to 0 if omitted.",
                "default": 0
            }
          },
          "required": ["x", "y"]
        }
      }
    }
];

/**
 * Filtered tools for the Agent (Planner/Generator) to reduce complexity and speed up response.
 * We prioritize move_to for all movement tasks.
 */
const agentTools = toioTools.filter(t =>
    ["move_to", "get_position", "stop", "set_light", "play_sound", "wait", "get_battery", "spin", "think", "play_melody", "move_path", "set_light_pattern"].includes(t.function.name)
);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toioTools, agentTools };
}
