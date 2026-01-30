'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CreateAgentData, Agent, OpenRouterModel, agentsApi } from '@/lib/api';

// Preset colors for avatars
const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#f97316', // Orange
  '#22c55e', // Green
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
];

interface AgentFormProps {
  agent?: Agent;
  onSubmit: (data: CreateAgentData) => Promise<unknown>;
  isLoading?: boolean;
}

export function AgentForm({ agent, onSubmit, isLoading }: AgentFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<CreateAgentData>({
    name: agent?.name || '',
    model: agent?.model || 'anthropic/claude-3.5-sonnet',
    role: agent?.role || '',
    systemPrompt: agent?.systemPrompt || '',
    avatarColor: agent?.avatarColor || AVATAR_COLORS[0],
    avatarUrl: agent?.avatarUrl || null,
    isPublic: agent?.isPublic || false,
  });

  // Fetch available models from OpenRouter
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await agentsApi.getModels();
        setModels(response.models);
      } catch (err) {
        console.error('Failed to fetch models:', err);
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter models based on search
  const filteredModels = useMemo(() => {
    if (!modelSearch) return models;
    const search = modelSearch.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(search) ||
        m.name.toLowerCase().includes(search) ||
        m.description?.toLowerCase().includes(search)
    );
  }, [models, modelSearch]);

  // Get selected model info
  const selectedModel = models.find((m) => m.id === formData.model);

  // Handle image upload (convert to base64 data URL for now)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setFormData({ ...formData, avatarUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.role.trim()) {
      setError('Role is required');
      return;
    }
    if (!formData.model) {
      setError('Please select a model');
      return;
    }

    try {
      await onSubmit(formData);
      router.push('/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    }
  };

  const formatPricePer1M = (pricePer1M: number) => {
    if (pricePer1M === 0) return 'Free';
    if (pricePer1M < 0.01) return '<$0.01/1M';
    if (pricePer1M < 1) return `$${pricePer1M.toFixed(2)}/1M`;
    return `$${pricePer1M.toFixed(2)}/1M`;
  };

  const formatPrice = (perTokenPrice: number, per1MPrice?: number) => {
    // Use pre-calculated per-1M price if available, otherwise calculate
    const pricePer1M = per1MPrice ?? perTokenPrice * 1_000_000;
    return formatPricePer1M(pricePer1M);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Avatar Section */}
      <div className="space-y-4">
        <label className="text-xs text-white/70">avatar</label>

        {/* Image Upload */}
        <div className="flex items-start gap-4">
          <div
            className="w-16 h-16 flex items-center justify-center text-xl font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
            style={{ backgroundColor: formData.avatarUrl ? 'transparent' : formData.avatarColor }}
            onClick={() => fileInputRef.current?.click()}
          >
            {formData.avatarUrl ? (
              <img
                src={formData.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              formData.name ? formData.name.charAt(0).toUpperCase() : '?'
            )}
          </div>
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-orange-500 hover:text-orange-400 transition-colors"
            >
              upload image
            </button>
            {formData.avatarUrl && (
              <button
                type="button"
                onClick={() => setFormData({ ...formData, avatarUrl: null })}
                className="ml-4 text-xs text-white/50 hover:text-white/70 transition-colors"
              >
                remove
              </button>
            )}
            <p className="text-xs text-white/30 mt-1">
              or choose a color below
            </p>
          </div>
        </div>

        {/* Color Picker */}
        <div className="flex gap-2">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setFormData({ ...formData, avatarColor: color, avatarUrl: null })}
              className={`w-8 h-8 transition-all ${
                !formData.avatarUrl && formData.avatarColor === color
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <label htmlFor="name" className="text-xs text-white/70">
          name *
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Skeptical Scientist"
          maxLength={100}
          className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
        />
      </div>

      {/* Model Search */}
      <div className="space-y-2" ref={modelDropdownRef}>
        <label htmlFor="model" className="text-xs text-white/70">
          ai model *
        </label>
        <div className="relative">
          <input
            type="text"
            value={showModelDropdown ? modelSearch : (selectedModel?.name || formData.model)}
            onChange={(e) => {
              setModelSearch(e.target.value);
              setShowModelDropdown(true);
            }}
            onFocus={() => {
              setShowModelDropdown(true);
              setModelSearch('');
            }}
            placeholder={modelsLoading ? 'Loading models...' : 'Search models...'}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
          />

          {showModelDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-black border border-white/20 max-h-64 overflow-y-auto">
              {modelsLoading ? (
                <div className="p-4 text-sm text-white/50">Loading models...</div>
              ) : filteredModels.length === 0 ? (
                <div className="p-4 text-sm text-white/50">No models found</div>
              ) : (
                filteredModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, model: model.id });
                      setShowModelDropdown(false);
                      setModelSearch('');
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-white/10 transition-colors ${
                      formData.model === model.id ? 'bg-orange-500/20' : ''
                    }`}
                  >
                    <div className="text-sm font-medium">{model.name}</div>
                    <div className="text-xs text-white/50 mt-0.5 flex items-center gap-2">
                      <span>{model.id}</span>
                      <span className="text-white/30">|</span>
                      <span>{formatPrice(model.pricing.prompt, model.pricing.promptPer1M)} in</span>
                      <span>{formatPrice(model.pricing.completion, model.pricing.completionPer1M)} out</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {selectedModel && !showModelDropdown && (
          <p className="text-xs text-white/30">
            {formatPrice(selectedModel.pricing.prompt, selectedModel.pricing.promptPer1M)} input, {formatPrice(selectedModel.pricing.completion, selectedModel.pricing.completionPer1M)} output
            {selectedModel.contextLength && ` | ${(selectedModel.contextLength / 1000).toFixed(0)}k context`}
          </p>
        )}
      </div>

      {/* Role */}
      <div className="space-y-2">
        <label htmlFor="role" className="text-xs text-white/70">
          role / personality *
        </label>
        <textarea
          id="role"
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          placeholder="e.g., You are a skeptical scientist who demands evidence and rigorous methodology. You challenge assumptions and point out logical fallacies."
          rows={3}
          maxLength={500}
          className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors resize-none"
        />
        <p className="text-xs text-white/30">{formData.role.length}/500 characters</p>
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <label htmlFor="systemPrompt" className="text-xs text-white/70">
          hidden system prompt (optional)
        </label>
        <textarea
          id="systemPrompt"
          value={formData.systemPrompt || ''}
          onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
          placeholder="Additional instructions that other agents won't see. Use this for secret biases, hidden agendas, or specific debate tactics."
          rows={5}
          maxLength={10000}
          className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors resize-none font-mono"
        />
        <p className="text-xs text-white/30">
          other agents won&apos;t see this prompt - use it for hidden instructions
        </p>
      </div>

      {/* Public Toggle */}
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`w-10 h-6 rounded-full transition-colors relative ${
              formData.isPublic ? 'bg-orange-500' : 'bg-white/20'
            }`}
            onClick={() => setFormData({ ...formData, isPublic: !formData.isPublic })}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                formData.isPublic ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </div>
          <span className="text-sm">make this agent public</span>
        </label>
        <p className="text-xs text-white/30 ml-13">
          public agents can be cloned and used by anyone
        </p>
      </div>

      {/* Preview */}
      <div className="border border-white/10 p-4 space-y-3">
        <p className="text-xs text-white/50">preview</p>
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 flex items-center justify-center text-lg font-bold flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: formData.avatarUrl ? 'transparent' : formData.avatarColor }}
          >
            {formData.avatarUrl ? (
              <img
                src={formData.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              formData.name ? formData.name.charAt(0).toUpperCase() : '?'
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{formData.name || 'Unnamed Agent'}</h3>
              {formData.isPublic && (
                <span className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  public
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mt-1">
              {formData.role || 'No role defined'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 bg-orange-500 text-black py-3 text-sm font-medium hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'saving...' : agent ? 'save changes' : 'create agent'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-8 py-3 text-sm border border-white/10 hover:border-white/30 transition-colors"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
