// chatSystemPrompt.ts — loads the Sentinel system prompt from the txt file once at
// module initialisation. Throws at startup if the file is missing so misconfigured
// deploys surface immediately rather than sending promptless requests to OpenAI.

import fs from 'node:fs'
import path from 'node:path'

export const SYSTEM_PROMPT: string = fs.readFileSync(
  path.join(process.cwd(), 'lib/services/sentinel-system-prompt.txt'),
  'utf-8'
).trim()
