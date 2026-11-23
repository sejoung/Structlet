import { log } from '../adapters/diagnostics/log';
import { downloadText } from '../adapters/files/browser-files';
import { FILE_EXTENSION, MIME_TYPE } from '../adapters/format/structlet-format';
import threeTier from '../../samples/three-tier.structlet?raw';
import gpuTraining from '../../samples/gpu-training.structlet?raw';
import migInference from '../../samples/mig-inference.structlet?raw';
import commerceAndMl from '../../samples/commerce-and-ml.structlet?raw';
import polarObservatory from '../../samples/polar-observatory.structlet?raw';

const SAMPLES = { 'three-tier': threeTier, 'gpu-training': gpuTraining, 'mig-inference': migInference, 'commerce-and-ml': commerceAndMl, 'polar-observatory': polarObservatory };

export function downloadSample(sample: keyof typeof SAMPLES): void {
  downloadText(SAMPLES[sample], `${sample}${FILE_EXTENSION}`, MIME_TYPE);
  log.info('files.sample-downloaded');
}
