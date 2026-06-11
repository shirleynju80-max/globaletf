import type { Target } from "../domain/types";

interface Props {
  targets: Target[];
  selectedTargetCode: string;
  onSelectTarget: (targetCode: string) => void;
}

export function TargetSelector({ targets, selectedTargetCode, onSelectTarget }: Props) {
  if (targets.length === 0) return null;

  return (
    <div className="target-selector">
      <span>跟踪标的</span>
      <div className="segmented-control" aria-label="选择指数标的">
        {targets.map((target) => (
          <button
            key={target.code}
            className={target.code === selectedTargetCode ? "active" : ""}
            type="button"
            onClick={() => onSelectTarget(target.code)}
          >
            {target.name}
          </button>
        ))}
      </div>
    </div>
  );
}
