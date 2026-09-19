import React, { useState, useEffect, useMemo } from 'react';
import type { Problem, CreateProblemRequest, UpdateProblemRequest } from '../types';
import { DIFFICULTY_TAGS } from '../types';
import { createProblem, updateProblem } from '../services/problemService';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';
import { BatchImportPanel, type BatchImportedCase } from './BatchImportPanel';
import type { BatchDelimiter } from '../utils/batchTestCases';

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
  const { error: showError } = useToastStore();
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

  // 批量录入草稿：切换标签页/重新打开面板时保留，成功导入或关闭弹窗时清空
  const [batchText, setBatchText] = useState('');
  const [batchDelimiter, setBatchDelimiter] = useState<BatchDelimiter>('auto');
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [batchImportCount, setBatchImportCount] = useState(0);

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
    setBatchText('');
    setBatchDelimiter('auto');
    setBatchPanelOpen(false);
    setBatchImportCount(0);
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

  // 已录入（非空白）的用例，作为批量导入重复检测的基准
  const existingCasesForBatch: BatchImportedCase[] = useMemo(
    () =>
      testCases
        .filter((t) => t.input.trim() || t.expectedOutput.trim())
        .map((t) => ({
          input: t.input.trim(),
          expectedOutput: t.expectedOutput.trim(),
          hidden: t.hidden,
        })),
    [testCases],
  );

  const handleBatchImport = (imported: BatchImportedCase[]) => {
    if (imported.length === 0) return;
    setTestCases((prev) => [
      ...prev.filter((t) => t.input.trim() || t.expectedOutput.trim()),
      ...imported,
    ]);
    setBatchImportCount((c) => c + imported.length);
    setBatchText('');
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
    setBatchText('');
    setBatchDelimiter('auto');
    setBatchPanelOpen(false);
    setBatchImportCount(0);
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
                {batchImportCount > 0 && (
                  <div style={{
                    padding: '8px 12px',
                    background: 'rgba(76, 175, 80, 0.1)',
                    border: '1px solid rgba(76, 175, 80, 0.3)',
                    borderRadius: '4px',
                    color: '#4caf50',
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span>✓ 已通过批量录入导入 {batchImportCount} 条用例，可在下方继续单条编辑或删除</span>
                    <button
                      type="button"
                      onClick={() => setBatchImportCount(0)}
                      style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px' }}
                    >
                      知道了
                    </button>
                  </div>
                )}

                <BatchImportPanel
                  isOpen={batchPanelOpen}
                  onToggle={() => setBatchPanelOpen(!batchPanelOpen)}
                  text={batchText}
                  onTextChange={setBatchText}
                  delimiter={batchDelimiter}
                  onDelimiterChange={setBatchDelimiter}
                  existingTestCases={existingCasesForBatch}
                  onImport={handleBatchImport}
                />

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
