import { useEffect, useRef } from "react";
import { Renderer } from "./render";
import type { Form } from "../types";
/** Accessible canvas avatar; owns and releases one shared-scheduler renderer. */
export function Gota({
  form,
  size,
  label,
  theme = "auto",
  reduced = false,
}: {
  form: Form;
  size: number;
  label: string;
  theme?: string;
  reduced?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const initial = useRef({ form, size });
  useEffect(() => {
    renderer.current = new Renderer(
      canvas.current!,
      initial.current.size,
      initial.current.form,
    );
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    renderer.current?.update(form, size, reduced);
  }, [form, size, reduced, theme]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      style={{ width: size, height: size }}
    />
  );
}
