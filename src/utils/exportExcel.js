/**
 * Excel 匯出工具
 *
 * 使用 xlsx 套件動態載入，將表頭與資料列組合成 .xlsx 並觸發下載。
 * 主要用於作答弱點分析 / 學生作答分析的「作答紀錄摘要」匯出。
 */

/**
 * 將作答紀錄摘要匯出為 Excel（.xlsx）並觸發瀏覽器下載
 *
 * @param {string[]} headers - 表頭列，例如 ['題號', '單元', '難度', '分數', '時間']
 * @param {Array<unknown[]>} rows - 資料列（二維陣列，每列為一筆作答摘要）
 * @param {string} filename - 下載檔名，例如 '作答弱點分析-作答紀錄摘要.xlsx'
 */
export async function downloadSummaryExcel(headers, rows, filename) {
  const XLSX = await import('xlsx');
  const sheetData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '作答紀錄摘要');
  XLSX.writeFile(wb, filename);
}
