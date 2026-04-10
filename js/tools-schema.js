/**
 * JSON Schema for tools provided to Gemma4 via Ollama
 */

const toioTools = [
    {
      "type": "function",
      "function": {
        "name": "move_forward",
        "description": "Move the toio cube forward. Useful for 'go forward', 'move ahead', 'advance'.",
        "parameters": {
          "type": "object",
          "properties": {
            "speed": {
              "type": "integer",
              "description": "Speed from 10 to 100. Default is 50.",
              "minimum": 10,
              "maximum": 100
            },
            "duration_ms": {
              "type": "integer",
              "description": "Duration to move in milliseconds (e.g., 500, 1000, 2000). Max 2500.",
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
        "name": "move_backward",
        "description": "Move the toio cube backward.",
        "parameters": {
          "type": "object",
          "properties": {
            "speed": {
              "type": "integer",
              "description": "Speed from 10 to 100.",
              "minimum": 10,
              "maximum": 100
            },
            "duration_ms": {
              "type": "integer",
              "description": "Duration to move in milliseconds. Max 2500.",
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
        "name": "turn",
        "description": "Turn the cube left or right.",
        "parameters": {
          "type": "object",
          "properties": {
            "direction": {
              "type": "string",
              "enum": ["left", "right"],
              "description": "Direction to turn."
            },
            "duration_ms": {
              "type": "integer",
              "description": "Duration to turn in milliseconds. Around 200-500 is good for 90 degrees.",
              "minimum": 100,
              "maximum": 2500
            }
          },
          "required": ["direction", "duration_ms"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "spin",
        "description": "Spin the cube around its center. Useful when asked to 'spin', 'twirl', or 'do a dance'.",
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
    }
];
