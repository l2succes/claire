# loop-fmt.jq — turn `claude -p --output-format stream-json` JSONL into readable lines.
# Usage: tail -f .context/loop-trace.jsonl | jq -Rrf scripts/loop-fmt.jq
# (-R: each input line is a raw string; fromjson parses it; -r: raw output.)
fromjson? // empty
| if .type == "system" then
    "⚙️  " + ((.subtype // "init") | tostring)
  elif .type == "assistant" then
    ( .message.content[]? |
      if .type == "text" then
        ( (.text // "") | gsub("\\s+"; " ") | if length > 0 then "💬 " + .[0:240] else empty end )
      elif .type == "tool_use" then
        "🔧 " + (.name // "tool") + "  " + ((.input // {}) | tojson | .[0:180])
      else empty end )
  elif .type == "user" then
    ( .message.content[]? |
      if .type == "tool_result" then
        "↳  " + ( ( .content
                    | if type == "array" then ( map(.text // (. | tojson)) | join(" ") )
                      else (. // "" | tostring) end )
                  | gsub("\\s+"; " ") | .[0:180] )
      else empty end )
  elif .type == "result" then
    "✅ " + ((.subtype // "done") | tostring) + ": "
       + ((.result // "") | tostring | gsub("\\s+"; " ") | .[0:240])
  else empty end
