export function useToast() {
  const { $toast } = useNuxtApp();
  return $toast;
}
