// Local dev against a Neon preview branch: `.env.preview.local` (from
// `neon env pull --branch <name> --file .env.preview.local`) overrides the
// production Neon values in .env.local. Process env wins over Next's .env files.
import { spawn } from 'node:child_process'
process.loadEnvFile('.env.preview.local')
const child = spawn('npx', ['next', 'dev', '-p', process.env.PORT || '3100'], { stdio: 'inherit', shell: true, env: process.env })
child.on('exit', (code) => process.exit(code ?? 0))
