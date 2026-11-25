import createGenerateCommand from './generate.mjs';
import createPreviewCommand from './preview.mjs';

/** Creates CLI commands sharing a build progress observer. */
export default function createCommands(onProgress) {
  return [createGenerateCommand(onProgress), createPreviewCommand(onProgress)];
}
