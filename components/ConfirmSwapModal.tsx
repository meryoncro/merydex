"use client";

import { Fragment } from "react";
import { AlertTriangle, ArrowRight, Loader, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Token } from "@/lib/tokens";

interface ConfirmSwapModalProps {
  isOpen: boolean;
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  toAmount: string;
  minAmount: string;
  priceImpact: number;
  slippage: number;
  isLoading: boolean;
  gasEstimate: string | null;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmSwapModal({
  isOpen,
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  minAmount,
  priceImpact,
  slippage,
  isLoading,
  gasEstimate,
  error,
  onConfirm,
  onCancel,
}: ConfirmSwapModalProps) {
  if (!isOpen) return null;

  const isHighImpact = priceImpact > 3;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold">Confirm Swap</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Swap Details */}
          <div className="space-y-4">
            {/* From */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">From</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-2xl font-semibold">{fromAmount}</p>
                  <p className="text-sm text-muted-foreground">{fromToken.symbol}</p>
                </div>
                <div
                  className="w-10 h-10 rounded-full border-2"
                  style={{ backgroundColor: fromToken.color + "20", borderColor: fromToken.color }}
                />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="bg-primary/10 rounded-full p-2">
                <ArrowRight className="w-5 h-5 text-primary" />
              </div>
            </div>

            {/* To */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">To (Minimum)</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-2xl font-semibold">{toAmount}</p>
                  <p className="text-xs text-muted-foreground">Min: {minAmount}</p>
                  <p className="text-sm text-muted-foreground">{toToken.symbol}</p>
                </div>
                <div
                  className="w-10 h-10 rounded-full border-2"
                  style={{ backgroundColor: toToken.color + "20", borderColor: toToken.color }}
                />
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="border-t border-border pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price Impact</span>
              <span
                className={
                  isHighImpact
                    ? "text-destructive font-semibold flex items-center gap-1"
                    : "text-foreground"
                }
              >
                {priceImpact.toFixed(2)}%
                {isHighImpact && <AlertTriangle className="w-4 h-4" />}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Slippage Tolerance</span>
              <span className="text-foreground">{slippage.toFixed(2)}%</span>
            </div>
            {gasEstimate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Gas</span>
                <span className="text-foreground text-xs">{gasEstimate}</span>
              </div>
            )}
          </div>

          {isHighImpact && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                High price impact detected. Proceed with caution.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-border p-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={onConfirm}
            disabled={isLoading || !!error}
          >
            {isLoading ? (
              <Fragment>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Confirming...
              </Fragment>
            ) : (
              "Confirm Swap"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
