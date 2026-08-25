# Streaming voice behavior

Jarvis speaks natural-language response text while a TrueForge turn is still running instead of waiting for the turn to finish.

## Behavior

- Complete sentences are queued for speech as soon as response deltas form a natural boundary.
- If the response pauses before a tool call without punctuation, a short idle timer flushes the pending phrase so it can be spoken before the tool returns.
- Tool traces, connector diagnostics, sandbox activity and raw tool arguments are never narrated automatically.
- Neural TTS requests are prepared as speech chunks are queued so synthesis can overlap with current playback and ongoing agent/tool work.
- Speech chunks play in order and are not interrupted by later response chunks.
- When a turn pauses for approval, any remaining response fragment is spoken; a generic approval prompt is used only when Jarvis produced no response text.
- Fatal errors interrupt the queue because they require immediate attention.
- Muting or starting a new session clears queued speech and cancels in-flight synthesis/playback.

This preserves the visible execution trace while making Jarvis feel conversational during the actual agent loop.
