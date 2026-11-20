/** Browser file input/output. Created and used only from the app layer. */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, fileName: string, type: string): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

/** Opens the system file picker and resolves with the chosen file's text, or null. */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      resolve({ name: file.name, text: await file.text() });
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Opens the picker for several files, or a whole folder, and resolves with their bytes. */
export function pickFiles(options: { accept?: string; directory?: boolean }): Promise<{ path: string; data: Uint8Array }[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (options.accept) input.accept = options.accept;
    if (options.directory) input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])];
      input.remove();
      if (files.length === 0) return resolve(null);
      resolve(await Promise.all(files.map(async (f) => ({ path: f.webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
