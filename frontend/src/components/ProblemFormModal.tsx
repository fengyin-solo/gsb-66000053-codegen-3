import React, { useState, useEffect, useMemo } from 'react';
import type { Problem, CreateProblemRequest, UpdateProblemRequest } from '../types';
import { DIFFICULTY_TAGS } from '../types';
import { createProblem, updateProblem } from '../services/problemService';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';
import {
  parseBatchTestCases,
  getValidCases,
} from '../utils/batchTestCases';

interface ProblemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (problem: Problem) => void;
  editingProblem?: Problem | null;
}

interface Example {
  input: string;
  output: string;
  explanation?: string;
}

interface TestCase {
  input: string;
  expectedOutput: string;
  hidden: boolean;
}

export const ProblemFormModal: React.FC<ProblemFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingProblem,
}) => {
  const { addProblem, updateProblem: updateProblemInStore } = useInterviewStore();
  const { error: showError, success: showSuccess } = useToastStore();
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [description, setDescription] = useState('');
  const [examples, setExamples] = useState<Example[]>([{ input: '', output: '', explanation: '' }]);
  const [testCases, setTestCases] = useState<TestCase[]>([{ input: '', expectedOutput: '', hidden: false }]);
  const [tagsInput, setTagsInput] = useState('');
  const [timeLimit, setTimeLimit] = useState(2000);
  const [memoryLimit, setMemoryLimit] = useState(256);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'examples' | 'testcases'>('basic');

  // 批量录入草稿状态：切换页签后仍保留，仅在关闭弹窗或完成写入时重置
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  // 行号 -> 预览中手动覆盖的隐藏值
  const [batchHiddenOverrides, setBatchHiddenOverrides] = useState<Map<number, boolean>>(new Map());

  // 随粘贴文本与已有用例实时解析，修正文本后预览自动刷新（允许修正后重试）
  const batchResult = useMemo(() => {
    if (!batchText.trim()) return null;
    return parseBatchTestCases(
      batchText,
      testCases.filter(tc => tc.input.trim() || tc.expectedOutput.trim()),
    );
  }, [batchText, testCases]);

  const isEditing = !!editingProblem;

  useEffect(() => {
    if (editingProblem) {
      setTitle(editingProblem.title);
      setDifficulty(editingProblem.difficulty);
      setDescription(editingProblem.description);
      setExamples(editingProblem.examples.length > 0 ? editingProblem.examples : [{ input: '', output: '', explanation: '' }]);
      setTestCases(editingProblem.testCases.length > 0 ? editingProblem.testCases : [{ input: '', expectedOutput: '', hidden: false }]);
      setTagsInput(editingProblem.tags.join(', '));
      setTimeLimit(editingProblem.timeLimit);
      setMemoryLimit(editingProblem.memoryLimit);
    } else {
      setTitle('');
      setDifficulty('easy');
      setDescription('');
      setExamples([{ input: '', output: '', explanation: '' }]);
      setTestCases([{ input: '', expectedOutput: '', hidden: false }]);
      setTagsInput('');
      setTimeLimit(2000);
      setMemoryLimit(256);
    }
    setError('');
    setActiveTab('basic');
    setBatchPanelOpen(false);
    setBatchText('');
    setBatchHiddenOverrides(new Map());
  }, [editingProblem, isOpen]);

  const handleAddExample = () => {
    setExamples([...examples, { input: '', output: '', explanation: '' }]);
  };

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  const handleExampleChange = (index: number, field: keyof Example, value: string) => {
    const newExamples = [...examples];
    newExamples[index] = { ...newExamples[index], [field]: value };
    setExamples(newExamples);
  };

  const handleAddTestCase = () => {
    setTestCases([...testCases, { input: '', expectedOutput: '', hidden: false }]);
  };

  const handleRemoveTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const handleTestCaseChange = (index: number, field: keyof TestCase, value: string | boolean) => {
    const newTestCases = [...testCases];
    newTestCases[index] = { ...newTestCases[index], [field]: value };
    setTestCases(newTestCases);
  };

  // 将预览中的隐藏勾选覆盖应用到解析结果
  const displayResult = useMemo(() => {
    if (!batchResult) return null;
    if (batchHiddenOverrides.size === 0) return batchResult;
    return {
      ...batchResult,
      rows: batchResult.rows.map(row =>
        row.testCase && batchHiddenOverrides.has(row.line)
          ? { ...row, testCase: { ...row.testCase, hidden: batchHiddenOverrides.get(row.line) as boolean } }
          : row,
      ),
    };
  }, [batchResult, batchHiddenOverrides]);

  const handleToggleBatchHidden = (line: number) => {
    // 仅保存预览中手动覆盖的隐藏值；重新解析后按行号仍生效，关闭/写入时清空
    setBatchHiddenOverrides(prev => {
      const next = new Map(prev);
      const current = displayResult?.rows.find(r => r.line === line)?.testCase?.hidden ?? false;
      next.set(line, !current);
      return next;
    });
  };

  const handleConfirmBatch = () => {
    if (!displayResult || displayResult.validCount === 0) return;

    // 写入前以当前已有用例再做一次查重，避免预览期间单条列表发生变化
    const existingKeys = new Set(
      testCases
        .filter(tc => tc.input.trim() || tc.expectedOutput.trim())
        .map(tc => `${tc.input.trim()} ${tc.expectedOutput.trim()}`),
    );

    const newCases: TestCase[] = [];
    for (const tc of getValidCases(displayResult)) {
      const key = `${tc.input.trim()} ${tc.expectedOutput.trim()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      newCases.push({ input: tc.input, expectedOutput: tc.expectedOutput, hidden: tc.hidden });
    }

    if (newCases.length === 0) {
      setError('没有可写入的用例：全部与已有用例重复');
      return;
    }

    // 追加到已有用例之后；末尾由单条录入留下的全空行保留，不影响原有单条增删
    setTestCases([...testCases, ...newCases]);
    showSuccess(`已写入 ${newCases.length} 条测试用例`);

    // 写入完成后收起批量面板并清空草稿
    setBatchText('');
    setBatchHiddenOverrides(new Map());
    setBatchPanelOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('请填写题目标题和描述');
      return;
    }

    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);
    const validExamples = examples.filter(e => e.input.trim() || e.output.trim());
    const validTestCases = testCases.filter(t => t.input.trim() || t.expectedOutput.trim());

    if (validExamples.length === 0) {
      setError('请至少添加一个示例');
      return;
    }

    if (validTestCases.length === 0) {
      setError('请至少添加一个测试用例');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const problemData: CreateProblemRequest = {
        title: title.trim(),
        difficulty,
        description: description.trim(),
        examples: validExamples,
        testCases: validTestCases,
        tags,
        timeLimit,
        memoryLimit,
      };

      let result: Problem;
      if (isEditing && editingProblem) {
        const updateData: UpdateProblemRequest = {
          id: editingProblem.id,
          ...problemData,
        };
        result = await updateProblem(editingProblem.id, updateData);
        updateProblemInStore(result);
      } else {
        result = await createProblem({
          ...problemData,
        });
        addProblem(result);
      }

      onSuccess(result);
      handleClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存题目失败';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDifficulty('easy');
    setDescription('');
    setExamples([{ input: '', output: '', explanation: '' }]);
    setTestCases([{ input: '', expectedOutput: '', hidden: false }]);
    setTagsInput('');
    setTimeLimit(2000);
    setMemoryLimit(256);
    setError('');
    setBatchPanelOpen(false);
    setBatchText('');
    setBatchHiddenOverrides(new Map());
    onClose();
  };

  if (!isOpen) return null;

  const tabButtonStyle = (active: boolean) => ({
    padding: '10px 20px',
    background: active ? '#333' : 'transparent',
    color: active ? '#fff' : '#888',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: active ? 500 : 400,
  });

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#2d2d2d',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: '120px',
    resize: 'vertical' as const,
    fontFamily: 'monospace',
  };

  const batchThStyle: React.CSSProperties = {
    padding: '8px 10px',
    textAlign: 'left',
    color: '#aaa',
    fontWeight: 500,
    borderBottom: '1px solid #3a3a3a',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  };

  const batchTdStyle: React.CSSProperties = {
    padding: '8px 10px',
    color: '#ddd',
    borderBottom: '1px solid #2f2f2f',
    verticalAlign: 'top',
    maxWidth: '280px',
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1e1e1e', borderRadius: '8px', width: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #333' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>
            {isEditing ? '编辑题目' : '创建新题目'}
          </h2>
          <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '4px', padding: '0 24px', borderBottom: '1px solid #333', background: '#1a1a1a' }}>
          <button style={tabButtonStyle(activeTab === 'basic')} onClick={() => setActiveTab('basic')}>基本信息</button>
          <button style={tabButtonStyle(activeTab === 'examples')} onClick={() => setActiveTab('examples')}>示例</button>
          <button style={tabButtonStyle(activeTab === 'testcases')} onClick={() => setActiveTab('testcases')}>测试用例</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '24px' }}>
            {activeTab === 'basic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>题目标题 *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="例如：两数之和"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>难度 *</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {DIFFICULTY_TAGS.map(tag => {
                      const isSelected = difficulty === tag.value;
                      return (
                        <button
                          key={tag.value}
                          type="button"
                          onClick={() => setDifficulty(tag.value)}
                          style={{
                            padding: '8px 20px',
                            borderRadius: '20px',
                            border: `2px solid ${isSelected ? tag.color : '#444'}`,
                            background: isSelected ? tag.bgColor : 'transparent',
                            color: isSelected ? tag.color : '#888',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: isSelected ? 500 : 400,
                            transition: 'all 0.2s',
                          }}
                        >
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>题目描述 *</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="请详细描述题目要求..."
                    style={textareaStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>标签（用逗号分隔）</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    placeholder="例如：数组, 哈希表, 双指针"
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>时间限制（毫秒）</label>
                    <input
                      type="number"
                      value={timeLimit}
                      onChange={e => setTimeLimit(parseInt(e.target.value) || 2000)}
                      min="100"
                      step="100"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>内存限制（MB）</label>
                    <input
                      type="number"
                      value={memoryLimit}
                      onChange={e => setMemoryLimit(parseInt(e.target.value) || 256)}
                      min="16"
                      step="16"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'examples' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {examples.map((example, index) => (
                  <div key={index} style={{ background: '#252525', borderRadius: '8px', padding: '16px', border: '1px solid #333' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ color: '#fff', fontWeight: 500 }}>示例 {index + 1}</span>
                      {examples.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveExample(index)}
                          style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '12px' }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', color: '#888', marginBottom: '4px', fontSize: '12px' }}>输入</label>
                        <textarea
                          value={example.input}
                          onChange={e => handleExampleChange(index, 'input', e.target.value)}
                          placeholder="输入数据"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#888', marginBottom: '4px', fontSize: '12px' }}>输出</label>
                        <textarea
                          value={example.output}
                          onChange={e => handleExampleChange(index, 'output', e.target.value)}
                          placeholder="预期输出"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#888', marginBottom: '4px', fontSize: '12px' }}>解释（可选）</label>
                        <textarea
                          value={example.explanation || ''}
                          onChange={e => handleExampleChange(index, 'explanation', e.target.value)}
                          placeholder="解释说明"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddExample}
                  style={{
                    padding: '12px',
                    border: '2px dashed #444',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  + 添加示例
                </button>
              </div>
            )}

            {activeTab === 'testcases' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 批量录入面板 */}
                <div style={{ background: '#252525', borderRadius: '8px', border: '1px solid #3a3a3a', overflow: 'hidden' }}>
                  {!batchPanelOpen ? (
                    <button
                      type="button"
                      onClick={() => setBatchPanelOpen(true)}
                      style={{
                        width: '100%',
                        padding: '14px',
                        border: 'none',
                        background: 'transparent',
                        color: '#64b5f6',
                        cursor: 'pointer',
                        fontSize: '14px',
                        textAlign: 'left',
                      }}
                    >
                      📋 批量录入测试用例（粘贴制表符或逗号分隔的多行文本，预览后一次性写入）
                    </button>
                  ) : (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#fff', fontWeight: 500, fontSize: '14px' }}>批量录入</span>
                        <button
                          type="button"
                          onClick={() => setBatchPanelOpen(false)}
                          style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer' }}
                        >
                          收起
                        </button>
                      </div>

                      <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.7 }}>
                        每行一条用例，列之间用 <strong style={{ color: '#ccc' }}>Tab（制表符）</strong>或<strong style={{ color: '#ccc' }}>逗号</strong>分隔（整段自动识别；含分隔符的字段可用双引号包裹）：
                        <br />
                        · 2 列格式：<code style={{ color: '#ccc' }}>输入 → 期望输出</code>，默认不隐藏；
                        <br />
                        · 3 列格式：<code style={{ color: '#ccc' }}>输入 → 期望输出 → 是否隐藏</code>，第 3 列填 是/否、true/false、1/0。
                        <br />
                        空行会被忽略；列数不一致、与已有用例或本次粘贴内容重复的行会逐条提示，修正文本后预览自动刷新。
                      </div>

                      <textarea
                        value={batchText}
                        onChange={e => setBatchText(e.target.value)}
                        placeholder={'1 2\t3\t是\n4 5\t9\t否\n1,2,false'}
                        style={{ ...textareaStyle, minHeight: '140px', fontSize: '13px' }}
                        spellCheck={false}
                      />

                      {displayResult && (
                        <>
                          {/* 逐条问题提示 */}
                          {(displayResult.errorCount > 0 || displayResult.duplicateCount > 0 || displayResult.blankCount > 0) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                              {displayResult.rows
                                .filter(row => row.status !== 'valid')
                                .map(row => {
                                  const color =
                                    row.status === 'error' ? '#f44336' :
                                    row.status === 'duplicate' ? '#ff9800' : '#9e9e9e';
                                  const label =
                                    row.status === 'error' ? '错误' :
                                    row.status === 'duplicate' ? '重复' : '空行';
                                  return (
                                    <div key={row.line} style={{ color, fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                      <span style={{ fontWeight: 600, flexShrink: 0 }}>第 {row.line} 行 · {label}</span>
                                      <span>{row.message}</span>
                                      {row.raw.trim() && (
                                        <code style={{ color: '#777', fontSize: '11px', wordBreak: 'break-all' }}>
                                          原文：{row.raw.length > 60 ? `${row.raw.slice(0, 60)}…` : row.raw}
                                        </code>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}

                          {/* 预览表格 */}
                          <div style={{ border: '1px solid #3a3a3a', borderRadius: '6px', overflow: 'auto', maxHeight: '280px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ background: '#1e1e1e', position: 'sticky', top: 0 }}>
                                  <th style={batchThStyle}>行</th>
                                  <th style={batchThStyle}>输入</th>
                                  <th style={batchThStyle}>期望输出</th>
                                  <th style={{ ...batchThStyle, width: '70px' }}>是否隐藏</th>
                                  <th style={{ ...batchThStyle, width: '70px' }}>状态</th>
                                </tr>
                              </thead>
                              <tbody>
                                {displayResult.rows.map(row => {
                                  const color =
                                    row.status === 'valid' ? '#4caf50' :
                                    row.status === 'error' ? '#f44336' :
                                    row.status === 'duplicate' ? '#ff9800' : '#9e9e9e';
                                  const label =
                                    row.status === 'valid' ? '有效' :
                                    row.status === 'error' ? '错误' :
                                    row.status === 'duplicate' ? '重复' : '空行';
                                  const isWritable = row.status === 'valid';
                                  return (
                                    <tr key={row.line} style={{ background: isWritable ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                      <td style={{ ...batchTdStyle, color: '#888', textAlign: 'center', whiteSpace: 'nowrap' }}>{row.line}</td>
                                      <td style={batchTdStyle}>
                                        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                          {row.testCase ? row.testCase.input : (row.raw.trim() ? row.raw : '—')}
                                        </span>
                                      </td>
                                      <td style={batchTdStyle}>
                                        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                          {row.testCase ? row.testCase.expectedOutput : '—'}
                                        </span>
                                      </td>
                                      <td style={{ ...batchTdStyle, textAlign: 'center' }}>
                                        {row.testCase ? (
                                          <input
                                            type="checkbox"
                                            checked={row.testCase.hidden}
                                            disabled={!isWritable}
                                            onChange={() => handleToggleBatchHidden(row.line)}
                                            style={{ cursor: isWritable ? 'pointer' : 'not-allowed' }}
                                          />
                                        ) : '—'}
                                      </td>
                                      <td style={{ ...batchTdStyle, textAlign: 'center', color, whiteSpace: 'nowrap' }}>{label}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* 汇总与操作 */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', color: '#aaa' }}>
                              识别到分隔符：{displayResult.delimiter === '\t' ? 'Tab（制表符）' : '逗号'}；
                              共 <strong style={{ color: '#4caf50' }}>{displayResult.validCount}</strong> 条可写入
                              {displayResult.blankCount > 0 && <span style={{ color: '#9e9e9e' }}>，{displayResult.blankCount} 行空行将忽略</span>}
                              {displayResult.errorCount > 0 && <strong style={{ color: '#f44336' }}>，{displayResult.errorCount} 行列数/内容错误</strong>}
                              {displayResult.duplicateCount > 0 && <strong style={{ color: '#ff9800' }}>，{displayResult.duplicateCount} 行重复</strong>}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={() => { setBatchText(''); setBatchHiddenOverrides(new Map()); }}
                                style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '13px' }}
                              >
                                清空
                              </button>
                              <button
                                type="button"
                                onClick={handleConfirmBatch}
                                disabled={displayResult.validCount === 0 || displayResult.errorCount > 0 || displayResult.duplicateCount > 0}
                                title={
                                  displayResult.errorCount > 0 || displayResult.duplicateCount > 0
                                    ? '存在错误或重复行，请先按上方提示修正后重试'
                                    : displayResult.validCount === 0
                                      ? '没有可写入的用例'
                                      : ''
                                }
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background:
                                    displayResult.validCount === 0 || displayResult.errorCount > 0 || displayResult.duplicateCount > 0
                                      ? '#3a3a3a' : '#4caf50',
                                  color:
                                    displayResult.validCount === 0 || displayResult.errorCount > 0 || displayResult.duplicateCount > 0
                                      ? '#777' : '#fff',
                                  cursor:
                                    displayResult.validCount === 0 || displayResult.errorCount > 0 || displayResult.duplicateCount > 0
                                      ? 'not-allowed' : 'pointer',
                                  fontSize: '13px',
                                }}
                              >
                                写入 {displayResult.validCount} 条用例
                              </button>
                            </div>
                          </div>
                          {(displayResult.errorCount > 0 || displayResult.duplicateCount > 0) && (
                            <div style={{ fontSize: '12px', color: '#f44336' }}>
                              请根据上方逐条提示修正粘贴内容（删除空行/重复行、补齐列数），预览会自动刷新，全部通过后即可一次性写入。
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {testCases.map((testCase, index) => (
                  <div key={index} style={{ background: '#252525', borderRadius: '8px', padding: '16px', border: '1px solid #333' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: '#fff', fontWeight: 500 }}>测试用例 {index + 1}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#888', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={testCase.hidden}
                            onChange={e => handleTestCaseChange(index, 'hidden', e.target.checked)}
                          />
                          隐藏用例
                        </label>
                      </div>
                      {testCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTestCase(index)}
                          style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '12px' }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', color: '#888', marginBottom: '4px', fontSize: '12px' }}>输入</label>
                        <textarea
                          value={testCase.input}
                          onChange={e => handleTestCaseChange(index, 'input', e.target.value)}
                          placeholder="输入数据"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#888', marginBottom: '4px', fontSize: '12px' }}>预期输出</label>
                        <textarea
                          value={testCase.expectedOutput}
                          onChange={e => handleTestCaseChange(index, 'expectedOutput', e.target.value)}
                          placeholder="预期输出"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddTestCase}
                  style={{
                    padding: '12px',
                    border: '2px dashed #444',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  + 添加测试用例
                </button>
              </div>
            )}

            {error && (
              <div style={{ color: '#f44336', marginTop: '16px', fontSize: '14px', padding: '8px 12px', background: 'rgba(244,67,54,0.1)', borderRadius: '4px' }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ padding: '16px 24px', borderTop: '1px solid #333', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: '#1a1a1a' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{ padding: '10px 24px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '14px' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '10px 24px', borderRadius: '4px', border: 'none', background: '#4caf50', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? '保存中...' : (isEditing ? '更新题目' : '创建题目')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
