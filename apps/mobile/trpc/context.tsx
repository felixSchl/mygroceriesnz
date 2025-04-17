import type { AppRouter } from "@repo/backend/trpc";
import { CreateTRPCClient } from "@trpc/client";
import { createContext, useContext } from "react";

const Context = createContext<CreateTRPCClient<AppRouter> | null>(null);

export function useTrpcClient() {
  const client = useContext(Context);
  if (!client) {
    throw new Error("useTrpcClient must be used within a TrpcProvider");
  }
  return client;
}

export function TrpcProvider({
  children,
  client,
}: {
  children: React.ReactNode;
  client: CreateTRPCClient<AppRouter>;
}) {
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
