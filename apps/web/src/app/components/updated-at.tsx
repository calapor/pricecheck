"use client";
import { useEffect, useState } from "react";

export function UpdatedAt({ at }: { at: number }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => setSecs(Math.floor((Date.now() - at) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [at]);
  return <span>Updated {secs}s ago</span>;
}
