import {
  useLocation,
  useNavigate,
  useSearchParams as useRRSearchParams,
} from "react-router-dom";

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    prefetch: async () => {},
  };
}

export function useSearchParams() {
  const [params] = useRRSearchParams();
  return params;
}

export function useParams<T extends Record<string, string>>() {
  return {} as T;
}
