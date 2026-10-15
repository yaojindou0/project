"use client";

import { Link as RouterLink } from "react-router-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  replace?: boolean;
  prefetch?: boolean;
};

/** next/link → react-router（静态包） */
export default function Link({
  href,
  replace,
  prefetch: _prefetch,
  children,
  ...rest
}: Props) {
  void _prefetch;
  return (
    <RouterLink to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
}
