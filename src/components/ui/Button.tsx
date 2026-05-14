import { Button } from "primereact/button";
import type { ButtonProps } from "primereact/button";

export type UIButtonProps = ButtonProps & {
  label?: string;
  icon?: string;
  severity?: "secondary" | "danger" | "info";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  outlined?: boolean;
  text?: boolean;
  rounded?: boolean;
  size?: "small" | "large";
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  type?: "button" | "submit";
};

export function UIButton(props: UIButtonProps) {
  return <Button {...props} />;
}
