// 폴더/파일 재귀 탐색 유틸리티
export async function scanFilesFromDataTransfer(items) {
  const files = [];
  const queue = [];

  // 초기 아이템 큐에 추가
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // webkitGetAsEntry가 지원되면 사용, 아니면 파일 그대로 사용
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : (item.kind === 'file' ? item.getAsFile() : null);
    if (entry) queue.push(entry);
  }

  while (queue.length > 0) {
    const entry = queue.shift();
    
    if (entry.isFile) {
      const file = await new Promise(resolve => entry.file(resolve));
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries는 한 번에 모든 파일을 가져오지 않을 수 있으므로 루프 필요
      const entries = await new Promise(resolve => {
        const result = [];
        const read = () => {
          reader.readEntries(batch => {
            if (!batch.length) resolve(result);
            else {
              result.push(...batch);
              read();
            }
          });
        };
        read();
      });
      queue.push(...entries);
    }
  }
  
  return files;
}