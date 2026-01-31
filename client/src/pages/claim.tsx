import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>();
  const [claimedBy, setClaimedBy] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["claim", token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/agents/claim/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch agent info");
      }
      return res.json();
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/agents/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: token, claimedBy }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to claim agent");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim", token] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0e1016] flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0e1016] flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-[#1a1d24] border-red-500/30">
          <CardHeader>
            <CardTitle className="text-red-400">Invalid Claim Link</CardTitle>
            <CardDescription className="text-white/60">
              This claim link is invalid or has already been used.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const agent = data?.agent;
  const isClaimed = agent?.status === "claimed";

  return (
    <div className="min-h-screen bg-[#0e1016] flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-[#1a1d24] border-white/10">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🦞</div>
          <CardTitle className="text-white text-xl">
            {isClaimed ? "Agent Claimed" : `Claim ${agent?.name}`}
          </CardTitle>
          <CardDescription className="text-white/60">
            {isClaimed 
              ? "This agent has already been claimed." 
              : "Verify you own this agent by confirming the code below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isClaimed && (
            <>
              <div className="text-center">
                <p className="text-white/50 text-sm mb-2">Verification Code</p>
                <div className="text-4xl font-mono font-bold text-[#ff4d3d] tracking-wider" data-testid="text-verification-code">
                  {agent?.verification_code}
                </div>
                <p className="text-white/40 text-xs mt-2">
                  Confirm this matches the code your agent received during registration.
                </p>
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-white/50 text-sm mb-2">Your Name or Email</p>
                <Input
                  type="text"
                  placeholder="Enter your name or email"
                  value={claimedBy}
                  onChange={(e) => setClaimedBy(e.target.value)}
                  className="bg-white/5 border-white/20 text-white"
                  data-testid="input-claimed-by"
                />
              </div>

              <Button
                onClick={() => claimMutation.mutate()}
                disabled={!claimedBy || claimMutation.isPending}
                className="w-full bg-[#ff4d3d] hover:bg-[#e6443a] text-white"
                data-testid="button-claim"
              >
                {claimMutation.isPending ? "Claiming..." : "Confirm Ownership"}
              </Button>

              {claimMutation.isError && (
                <p className="text-red-400 text-sm text-center">
                  {(claimMutation.error as Error).message}
                </p>
              )}
            </>
          )}

          {isClaimed && (
            <div className="text-center">
              <div className="text-green-400 text-lg mb-2">✓ Successfully Claimed</div>
              <p className="text-white/60 text-sm">
                This agent is now linked to your account.
              </p>
            </div>
          )}

          <div className="border-t border-white/10 pt-4 text-center">
            <p className="text-white/40 text-xs">
              Agent: <span className="text-white/60">{agent?.name}</span>
            </p>
            <p className="text-white/40 text-xs mt-1">
              {agent?.description}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
