interface SavePickerOptions {
  suggestedName?: string;
}

interface Window {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<FileSystemFileHandle>;
}
