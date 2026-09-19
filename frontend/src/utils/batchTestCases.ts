// 批量测试用例录入：制表符/逗号分隔文本的解析与校验工具

export type BatchDelimiter = 'auto' | 'tab' | 'comma';

export interface BatchParsedRow {
  lineNo: number;
  raw: string;
  fields: string[];
  input: string;
  expectedOutput: string;
  hidden: boolean;
  hiddenText: string;
  errors: string[];
  warnings: string[];
  duplicateOf?: number; // 首次出现该输入/输出组合的行号（行号，含空行计数）
  duplicateInExisting?: boolean;
}

export interface BatchParseResult {
  rows: BatchParsedRow[];
  delimiter: 'tab' | 'comma';
  expectedColumns: 2 | 3;
  hasErrors: boolean;
  hasWarnings: boolean;
  validCount: number;
}

const HIDDEN_TRUE_TOKENS = new Set(['1', 'true', 'yes', 'y', '隐藏', '是']);
const HIDDEN_FALSE_TOKENS = new Set(['0', 'false', 'no', 'n', '公开', '否', '']);

/**
 * 拆分一行：制表符直接拆分；逗号支持简单的双引号包裹字段（字段内可含逗号）。
 */
function splitLine(line: string, delimiter: 'tab' | 'comma'): { fields: string[]; quoteWarning: boolean } {
  if (delimiter === 'tab') {
    return { fields: line.split('\t'), quoteWarning: false };
  }

  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  let sawNonSpace = false; // 引号开启前是否出现过非空白字符
  let sawQuote = false;
  let i = 0;

  const push = () => {
    fields.push(cur);
    cur = '';
  };

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        sawQuote = true;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && !sawQuote && !sawNonSpace) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      push();
      i += 1;
      continue;
    }
    if (ch !== ' ' && ch !== '\t' && ch !== '\r') {
      sawNonSpace = true;
    }
    cur += ch;
    i += 1;
  }
  push();

  // 引号未闭合时给出提示（仍按已解析内容使用）
  return { fields, quoteWarning: inQuotes };
}

/**
 * 解析粘贴的多行文本，并逐行校验：
 * - 空行：提示（warning），不阻断导入
 * - 列数不一致：阻断错误（error）
 * - 输入或期望输出为空：阻断错误
 * - 重复用例（批内或与已有用例）：阻断错误
 *
 * @param text       原始粘贴文本
 * @param delimiter  分隔符（auto 时按文本中出现的制表符/逗号自动判断）
 * @param existing   已有测试用例，用于重复检测
 */
export function parseBatchTestCases(
  text: string,
  delimiter: BatchDelimiter,
  existing: { input: string; expectedOutput: string }[],
): BatchParseResult {
  const lines = text.split(/\r\n|\r|\n/);

  let resolved: 'tab' | 'comma' = 'comma';
  if (delimiter === 'tab') {
    resolved = 'tab';
  } else if (delimiter === 'comma') {
    resolved = 'comma';
  } else {
    resolved = lines.some((l) => l.includes('\t')) ? 'tab' : 'comma';
  }

  // 先做初步拆分，空行不参与列数推断
  const rawRows = lines.map((raw, idx) => {
    const isEmpty = raw.trim() === '';
    const { fields, quoteWarning } = splitLine(raw, resolved);
    return {
      lineNo: idx + 1,
      raw,
      fields,
      isEmpty,
      quoteWarning,
      errors: [] as string[],
      warnings: [] as string[],
    };
  });

  const nonEmpty = rawRows.filter((r) => !r.isEmpty);

  // 期望列数：取 2/3 列中的多数，平局时优先 2 列
  const count2 = nonEmpty.filter((r) => r.fields.length === 2).length;
  const count3 = nonEmpty.filter((r) => r.fields.length === 3).length;
  const expectedColumns: 2 | 3 = count3 > count2 ? 3 : 2;

  const keySeen = new Map<string, number>();
  for (const t of existing) {
    const inp = t.input.trim();
    const out = t.expectedOutput.trim();
    if (inp || out) {
      keySeen.set(`${inp}\u0000${out}`, -1);
    }
  }

  const rows: BatchParsedRow[] = rawRows.map((r) => {
    const row: BatchParsedRow = {
      lineNo: r.lineNo,
      raw: r.raw,
      fields: r.fields,
      input: '',
      expectedOutput: '',
      hidden: false,
      hiddenText: '',
      errors: [...r.errors],
      warnings: [...r.warnings],
    };

    if (r.isEmpty) {
      row.warnings.push('空行，将被忽略');
      return row;
    }

    if (r.quoteWarning) {
      row.warnings.push('存在未闭合的双引号，请确认是否漏写');
    }

    // 列数校验
    if (r.fields.length !== expectedColumns) {
      if (r.fields.length < expectedColumns) {
        row.errors.push(`列数不足：第 ${r.lineNo} 行有 ${r.fields.length} 列，应为 ${expectedColumns} 列（输入、期望输出${expectedColumns === 3 ? '、是否隐藏' : ''}）`);
      } else {
        row.errors.push(`列数过多：第 ${r.lineNo} 行有 ${r.fields.length} 列，应为 ${expectedColumns} 列；若数据本身包含${resolved === 'comma' ? '逗号' : '制表符'}，请用双引号包裹该字段或切换分隔符`);
      }
      row.input = r.fields[0] ?? '';
      row.expectedOutput = r.fields[1] ?? '';
      row.hiddenText = expectedColumns === 3 ? (r.fields[2] ?? '') : '';
    } else {
      const input = (r.fields[0] ?? '').trim();
      const output = (r.fields[1] ?? '').trim();
      row.input = input;
      row.expectedOutput = output;

      if (!input) {
        row.errors.push(`第 ${r.lineNo} 行缺少输入内容`);
      }
      if (!output) {
        row.errors.push(`第 ${r.lineNo} 行缺少期望输出`);
      }

      const tokenRaw = (r.fields[2] ?? '').trim();
      if (expectedColumns === 3) {
        row.hiddenText = tokenRaw;
        const token = tokenRaw.toLowerCase();
        if (HIDDEN_TRUE_TOKENS.has(token)) {
          row.hidden = true;
        } else if (HIDDEN_FALSE_TOKENS.has(token)) {
          row.hidden = false;
        } else {
          row.warnings.push(`「${tokenRaw}」不是有效的隐藏标记（可用 1/true/是/隐藏 表示隐藏），已按公开处理`);
          row.hidden = false;
        }
      }
    }

    // 重复检测：只要能取得输入与期望输出即检查（列数不符的行也一并提示，避免多轮修正）
    if (row.input && row.expectedOutput) {
      const key = `${row.input}\u0000${row.expectedOutput}`;
      const firstLine = keySeen.get(key);
      if (firstLine !== undefined) {
        if (firstLine === -1) {
          row.duplicateInExisting = true;
          row.errors.push(`第 ${r.lineNo} 行与已有测试用例重复（输入和期望输出完全相同）`);
        } else {
          row.duplicateOf = firstLine;
          row.errors.push(`第 ${r.lineNo} 行与第 ${firstLine} 行重复（输入和期望输出完全相同）`);
        }
      } else {
        keySeen.set(key, r.lineNo);
      }
    }

    return row;
  });

  return {
    rows,
    delimiter: resolved,
    expectedColumns,
    hasErrors: rows.some((r) => r.errors.length > 0),
    hasWarnings: rows.some((r) => r.warnings.length > 0),
    validCount: rows.filter((r) => r.errors.length === 0 && !r.warnings.some((w) => w === '空行，将被忽略') && r.input).length,
  };
}
