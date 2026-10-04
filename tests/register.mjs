// Registers the ?raw ESM loader hooks for the test run.
import { register } from 'node:module'
register('./raw-loader.mjs', import.meta.url)
