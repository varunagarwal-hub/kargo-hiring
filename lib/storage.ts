import 'server-only'
import { Files } from 'files-sdk'
import { neon } from 'files-sdk/neon'

// Original CV files, in the private Neon Object Storage bucket declared in neon.ts.
// Credentials/endpoint come from the AWS_* variables Neon provides for the branch.
export const CV_BUCKET = 'mesa'

let files: Files | null = null
const cvFiles = () => (files ??= new Files({ adapter: neon({ bucket: CV_BUCKET }) }))

export async function putCv(key: string, body: Buffer, contentType: string): Promise<void> {
  await cvFiles().upload(key, body, { contentType })
}

/** Short-lived presigned GET URL; the bucket itself is never public. */
export async function cvUrl(key: string): Promise<string> {
  return cvFiles().url(key, { expiresIn: 60 })
}
