import React, { useMemo } from 'react';
import {
  parseBatchTestCases,
  type BatchDelimiter,
  type BatchParseResult,
} from '../utils/batchTestCases';

export interface BatchImportedCase {
  input: string;
  expectedOutput: string;
  hidden: boolean;
}

interface BatchImportPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  text: string;
  onTextChange: (value: string) => void;
  delimiter: BatchDelimiter;
  onDelimiterChange: (value: BatchDelimiter) => void;
  existingTestCases: BatchImportedCase[];
  onImport: (cases: BatchImportedCase[]) => void;
}

/**
 * 测试用例批量录入面板：
 * 粘贴制表符/逗号分隔的多行文本 -> 逐行展示预览（输入/期望输出/是否隐藏）
 * -> 空行、列数不一致、重复用例逐条提示 -> 修正后重新解析 -> 一次性导入
 */
export const BatchImportPanel: React.FC<BatchImportPanelProps> = ({
  isOpen,
  onToggle,
  text,
  onTextChange,
  delimiter,
  onDelimiterChange,
  existingTestCases,
  onImport,
}) => {

  const result: BatchParseResult | null = useMemo(() => {
    if (!text.trim()) return null;
    return parseBatchTestCases(text, delimiter, existingTestCases);
  }, [text, delimiter, existingTestCases]);

  const importableRows = result
    ? result.rows.filter(
        (r) =>
          r.errors.length === 0 &&
          !r.warnings.some((w) => w === '空行，将被忽略') &&
          r.input,
      )
    : [];

  const handleImport = () => {
    if (!result || result.hasErrors || importableRows.length === 0) return;
    onImport(
      importableRows.map((r) => ({
        input: r.input,
        expectedOutput: r.expectedOutput,
        hidden: r.hidden,
      })),
    );
  };

  const delimiterButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${active ? '#667eea' : '#555'}`,
    background: active ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
    color: active ? '#667eea' : '#888',
    cursor: 'pointer',
    fontSize: '12px',
  });

  return (
    <div
      style={{
        background: '#252525',
        borderRadius: '8px',
        border: '1px solid #444',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#fff', fontWeight: 500, fontSize: '14px' }}>
          📋 批量录入测试用例（制表符 / 逗号分隔，粘贴后预览再导入）
        </span>
        <span style={{ color: '#888', fontSize: '12px' }}>
          {isOpen ? '收起 ▲' : '展开 ▼'}
        </span>
      </button>

      {isOpen && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.6 }}>
            每行一条用例，格式：
            <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: '3px', color: '#ccc', margin: '0 4px' }}>
              输入{result?.delimiter === 'comma' ? ',' : ' ⇥ '}期望输出{result?.delimiter === 'comma' ? ',' : ' ⇥ '}是否隐藏(可选)
            </code>
            ；第三列填 <code style={{ color: '#ccc' }}>1/true/是/隐藏</code> 表示隐藏用例，留空或填 0 表示公开。空行会被忽略；列数不一致或重复用例需修正后才能导入。
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>分隔符：</span>
            <button type="button" style={delimiterButtonStyle(delimiter === 'auto')} onClick={() => onDelimiterChange('auto')}>
              自动检测
            </button>
            <button type="button" style={delimiterButtonStyle(delimiter === 'tab')} onClick={() => onDelimiterChange('tab')}>
              制表符（Tab）
            </button>
            <button type="button" style={delimiterButtonStyle(delimiter === 'comma')} onClick={() => onDelimiterChange('comma')}>
              逗号
            </button>
            {result && (
              <span style={{ color: '#666', fontSize: '12px', marginLeft: 'auto' }}>
                当前识别：{result.delimiter === 'tab' ? '制表符' : '逗号'} · {result.expectedColumns} 列格式
              </span>
            )}
          </div>

          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={
              result?.delimiter === 'comma'
                ? '1 2 3,6,false\n4 5,9,1\n（每行：输入,期望输出,是否隐藏(可选)）'
                : '1 2 3\t6\tfalse\n4 5\t9\t1\n（每行：输入⇥期望输出⇥是否隐藏(可选)）'
            }
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '140px',
              padding: '10px 12px',
              borderRadius: '4px',
              border: '1px solid #555',
              background: '#2d2d2d',
              color: '#fff',
              fontSize: '13px',
              fontFamily: 'monospace',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />

          {result && (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#1a1a1a',
                  borderRadius: '4px',
                  fontSize: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#ccc' }}>共 {result.rows.length} 行</span>
                <span style={{ color: '#4caf50' }}>可导入 {result.validCount} 条</span>
                {result.hasErrors && <span style={{ color: '#f44336' }}>错误 {result.rows.filter((r) => r.errors.length > 0).length} 行</span>}
                {result.hasWarnings && <span style={{ color: '#ff9800' }}>警告 {result.rows.filter((r) => r.warnings.length > 0).length} 行</span>}
                <span style={{ color: '#666', marginLeft: 'auto' }}>预览随输入实时更新，修正后可直接重新核对</span>
              </div>

              <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #333', borderRadius: '4px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr 1fr 64px',
                    background: '#1a1a1a',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {['行号', '输入', '期望输出', '是否隐藏'].map((h) => (
                    <div key={h} style={{ padding: '8px 10px', color: '#888', fontSize: '12px', fontWeight: 500 }}>
                      {h}
                    </div>
                  ))}
                </div>
                {result.rows.map((row) => {
                  const isEmptyRow = row.warnings.some((w) => w === '空行，将被忽略');
                  const borderColor = row.errors.length > 0 ? '#f44336' : row.warnings.length > 0 ? '#ff9800' : 'transparent';
                  return (
                    <React.Fragment key={row.lineNo}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '44px 1fr 1fr 64px',
                          borderTop: '1px solid #2d2d2d',
                          borderLeft: `3px solid ${borderColor}`,
                          background: row.errors.length > 0 ? 'rgba(244,67,54,0.06)' : 'transparent',
                        }}
                      >
                        <div style={{ padding: '8px 10px', color: '#666', fontSize: '12px', fontFamily: 'monospace' }}>
                          {row.lineNo}
                        </div>
                        <div style={{ padding: '8px 10px', color: isEmptyRow ? '#666' : '#fff', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {isEmptyRow ? '（空行，将忽略）' : row.input || '—'}
                        </div>
                        <div style={{ padding: '8px 10px', color: isEmptyRow ? '#666' : '#fff', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {isEmptyRow ? '' : row.expectedOutput || '—'}
                        </div>
                        <div style={{ padding: '8px 10px', fontSize: '12px' }}>
                          {!isEmptyRow && row.errors.length === 0 && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '11px',
                                background: row.hidden ? 'rgba(255, 152, 0, 0.15)' : 'rgba(76, 175, 80, 0.15)',
                                color: row.hidden ? '#ff9800' : '#4caf50',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {row.hidden ? '隐藏' : '公开'}
                            </span>
                          )}
                          {!isEmptyRow && row.errors.length > 0 && (
                            <span style={{ color: '#f44336', fontSize: '16px' }}>✕</span>
                          )}
                        </div>
                      </div>
                      {(row.errors.length > 0 || row.warnings.length > 0) && (
                        <div style={{ borderLeft: `3px solid ${borderColor}`, padding: '2px 12px 8px 57px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {row.errors.map((msg, i) => (
                            <div key={`e${i}`} style={{ color: '#f44336', fontSize: '11px' }}>✕ {msg}</div>
                          ))}
                          {row.warnings.map((msg, i) => (
                            <div key={`w${i}`} style={{ color: '#ff9800', fontSize: '11px' }}>⚠ {msg}</div>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => onTextChange('')}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '4px',
                    border: '1px solid #555',
                    background: 'transparent',
                    color: '#ccc',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={result.hasErrors || importableRows.length === 0}
                  title={
                    result.hasErrors
                      ? '存在列数不一致或重复用例等错误，请按行内提示修正后再导入'
                      : importableRows.length === 0
                        ? '没有可导入的用例'
                        : ''
                  }
                  style={{
                    padding: '8px 20px',
                    borderRadius: '4px',
                    border: 'none',
                    background: result.hasErrors || importableRows.length === 0 ? '#444' : '#4caf50',
                    color: '#fff',
                    cursor: result.hasErrors || importableRows.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {result.hasErrors
                    ? '请先修正错误行'
                    : `确认导入 ${importableRows.length} 条用例`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
