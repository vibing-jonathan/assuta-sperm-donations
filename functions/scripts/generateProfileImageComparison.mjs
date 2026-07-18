import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ARCHIE_1436_APPEARANCE,
  buildDonorProfilePrompt,
  generateProfileImageWithGemini,
  generateProfileImageWithOpenAI,
} from '../lib/profileImageGeneration.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const outputDirectory = path.join(repositoryRoot, 'output', 'imagegen')
const prompt = buildDonorProfilePrompt(ARCHIE_1436_APPEARANCE)
const providerArgument = process.argv.find((argument) => argument.startsWith('--provider='))
const provider = providerArgument?.split('=', 2)[1] ?? 'both'
if (!['both', 'gemini', 'openai'].includes(provider)) {
  throw new Error('Provider must be one of: both, gemini, openai.')
}

await mkdir(outputDirectory, { recursive: true })
const promptPath = path.join(outputDirectory, 'archie-1436-shared-prompt.txt')
await writeFile(promptPath, `${prompt}\n`, 'utf8')

const outputs = []
if (provider === 'both' || provider === 'gemini') {
  const gemini = await generateProfileImageWithGemini(prompt, process.env.GEMINI_API_KEY ?? '')
  const geminiExtension = gemini.mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const geminiPath = path.join(outputDirectory, `archie-1436-gemini-${gemini.requestedSize}.${geminiExtension}`)
  await writeFile(geminiPath, gemini.bytes)
  outputs.push({
    provider: 'Gemini', model: gemini.model, requestedSize: gemini.requestedSize, path: geminiPath,
  })
}

if (provider === 'both' || provider === 'openai') {
  const openai = await generateProfileImageWithOpenAI(prompt, process.env.OPENAI_API_KEY ?? '')
  const openAIPath = path.join(outputDirectory, `archie-1436-openai-${openai.requestedSize}.png`)
  await writeFile(openAIPath, openai.bytes)
  outputs.push({
    provider: 'OpenAI', model: openai.model, requestedSize: openai.requestedSize, path: openAIPath,
  })
}

console.log(JSON.stringify({
  promptPath,
  outputs,
}, null, 2))
