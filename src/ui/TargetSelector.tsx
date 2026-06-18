import type { Target } from "../domain/types";

interface Props {
  targets: Target[];
  selectedTargetCode: string;
  disabledTargetCodes?: ReadonlySet<string>;
  onSelectTarget: (targetCode: string) => void;
}

export function TargetSelector({ targets, selectedTargetCode, disabledTargetCodes, onSelectTarget }: Props) {
  if (targets.length === 0) return null;

  return (
    <div className="target-selector">
      <span>跟踪标的</span>
      <div className="segmented-control" aria-label="选择指数标的">
        {targets.map((target) => {
          const disabled = disabledTargetCodes?.has(target.code) ?? false;
          return (
            <button
              key={target.code}
              className={[target.code === selectedTargetCode ? "active" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ")}
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              title={disabled ? "暂无跟踪产品" : undefined}
              onClick={() => {
                if (disabled) return;
                onSelectTarget(target.code);
              }}
            >
              {target.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
