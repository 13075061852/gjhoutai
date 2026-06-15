import { createRoot, type Root } from 'react-dom/client';
import ShinyText from './ShinyText/ShinyText';
import SpotlightCard from './SpotlightCard/SpotlightCard';
import './ApimartReactBitsShowcase.css';

export interface ReactBitsPromptIdea {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export type ReactBitsOption = [value: string, label: string];

interface MountOptions {
  heroTarget?: Element | null;
  modelTarget?: Element | null;
  promptTarget?: Element | null;
  ideas: ReactBitsPromptIdea[];
  models: ReactBitsOption[];
  selectedModel: string;
  selectedModelIsCustom: boolean;
  modelHint: string;
  mode: 'image' | 'video';
  taskCount: number;
  hasApiKey: boolean;
  latestStatus?: string;
  onPromptSelect: (prompt: string) => void;
}

function ApimartHero({
  mode,
}: Pick<MountOptions, 'mode'>) {
  return (
    <div className="apimart-reactbits-hero">
      <div className="apimart-reactbits-orbit" aria-hidden="true" />
      <div className="apimart-reactbits-grid" aria-hidden="true" />
      <SpotlightCard className="apimart-reactbits-spotlight" spotlightColor="rgba(94, 234, 212, 0.22)">
        <div className="apimart-reactbits-hero-content">
          <div className="apimart-reactbits-kicker">
            <i className="ti ti-sparkles" aria-hidden="true" />
            <ShinyText
              text="React Bits enhanced"
              speed={3.2}
              color="rgba(255, 255, 255, .62)"
              shineColor="#ffffff"
            />
          </div>
          <h3 className="apimart-reactbits-title">
            {mode === 'video' ? '把分镜变成动态画面' : '把提示词变成可交付视觉'}
          </h3>
          <p className="apimart-reactbits-copy">
            输入画面、风格与参考图，快速生成可用于产品、海报和内容创作的视觉素材
          </p>
        </div>
      </SpotlightCard>
    </div>
  );
}

function ModelPicker({
  models,
  selectedModel,
  selectedModelIsCustom,
  modelHint,
  mode,
}: Pick<MountOptions, 'models' | 'selectedModel' | 'selectedModelIsCustom' | 'modelHint' | 'mode'>) {
  return (
    <div className="apimart-rb-model-card">
      <span className="apimart-rb-model-cover" aria-hidden="true">
        <i className={`ti ti-${mode === 'video' ? 'video' : 'photo'}`} aria-hidden="true" />
      </span>
      <div className="apimart-rb-model-main">
        <select
          id="apimartModel"
          aria-label="选择 APIMart 生成模型"
          defaultValue={selectedModelIsCustom ? 'custom' : selectedModel}
        >
          {models.map(([value, label]) => (
            <option key={value} value={value}>
              {label} ({value})
            </option>
          ))}
          <option value="custom">自定义模型</option>
        </select>
      </div>
      <input
        id="apimartModelCustom"
        className="apimart-rb-custom-model"
        type="text"
        defaultValue={selectedModelIsCustom ? selectedModel : ''}
        placeholder="输入自定义模型 ID"
        autoComplete="off"
        hidden={!selectedModelIsCustom}
      />
    </div>
  );
}

function PromptIdeas({
  ideas,
  onPromptSelect,
}: Pick<MountOptions, 'ideas' | 'onPromptSelect'>) {
  return (
    <div className="apimart-reactbits-prompt-strip">
      <div className="apimart-reactbits-prompt-head">
        <strong>灵感模板</strong>
        <span>点击写入提示词</span>
      </div>
      <div className="apimart-reactbits-prompt-grid">
        {ideas.slice(0, 3).map((idea, index) => (
          <button
            className="apimart-reactbits-prompt-card"
            key={idea.id}
            type="button"
            onClick={() => onPromptSelect(idea.prompt)}
          >
            <SpotlightCard
              spotlightColor={index === 1 ? 'rgba(251, 191, 36, 0.24)' : 'rgba(59, 130, 246, 0.18)'}
            >
              <em>
                <i className={`ti ${idea.icon}`} aria-hidden="true" />
              </em>
              <strong>{idea.label}</strong>
              <span>{idea.prompt}</span>
            </SpotlightCard>
          </button>
        ))}
      </div>
    </div>
  );
}

export function mountApimartReactBitsShowcase(options: MountOptions) {
  const roots: Root[] = [];

  if (options.heroTarget) {
    const root = createRoot(options.heroTarget);
    roots.push(root);
    root.render(
      <ApimartHero
        mode={options.mode}
      />,
    );
  }

  if (options.modelTarget) {
    const root = createRoot(options.modelTarget);
    roots.push(root);
    root.render(
      <ModelPicker
        models={options.models}
        selectedModel={options.selectedModel}
        selectedModelIsCustom={options.selectedModelIsCustom}
        modelHint={options.modelHint}
        mode={options.mode}
      />,
    );
  }

  if (options.promptTarget) {
    const root = createRoot(options.promptTarget);
    roots.push(root);
    root.render(<PromptIdeas ideas={options.ideas} onPromptSelect={options.onPromptSelect} />);
  }

  return () => {
    roots.forEach((root) => root.unmount());
  };
}
