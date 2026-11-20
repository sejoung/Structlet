// Renames the single-file build output to structlet.html.
import { renameSync } from 'node:fs';
renameSync('dist-single/index.html', 'dist-single/structlet.html');
