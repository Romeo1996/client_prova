import { InputSwitch } from "primereact/inputswitch";

interface UISwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function UISwitch({ checked, onChange }: UISwitchProps) {
  return <InputSwitch checked={checked} onChange={(e) => onChange(e.value as boolean)} />;
}
