// Browser boundary: offers a text as a file download, with no request involved.
export function saveTextAsDownload(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking in the same task has cancelled downloads in some engines.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
