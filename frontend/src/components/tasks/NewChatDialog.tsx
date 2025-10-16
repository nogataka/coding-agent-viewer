import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  taskAttemptsApi,
  profilesApi,
  type ProfileListing,
  type TaskAttemptStartResponse,
} from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  profileLabel: string;
  onSuccess?: (attempt: TaskAttemptStartResponse) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  projectId,
  profileLabel,
  onSuccess,
}: NewChatDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [profiles, setProfiles] = useState<ProfileListing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [variant, setVariant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const selectedProfile = useMemo(() => {
    if (!profiles) return null;
    return profiles.find((profile) => profile.label === profileLabel) ?? null;
  }, [profiles, profileLabel]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let mounted = true;

    const loadProfiles = async () => {
      try {
        const data = await profilesApi.list();
        if (!mounted) return;
        setProfiles(data);
        const profile = data.find((item) => item.label === profileLabel);
        if (profile?.variants && profile.variants.length > 0) {
          setVariant((prev) => {
            if (prev) return prev;
            return 'default';
          });
        } else {
          setVariant(null);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load profiles', err);
        setError('Failed to load profiles');
      }
    };

    void loadProfiles();

    return () => {
      mounted = false;
    };
  }, [open, profileLabel]);

  useEffect(() => {
    if (!open) {
      setPrompt('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!prompt.trim()) {
        setError('Prompt is required');
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const attempt = await taskAttemptsApi.create({
          projectId,
          prompt,
          variantLabel: variant ?? undefined,
        });
        toast({
          title: 'Execution started',
          description: 'New chat has been queued for execution.',
        });
        onOpenChange(false);
        setPrompt('');
        if (onSuccess) {
          onSuccess(attempt);
        }
      } catch (err) {
        console.error('Failed to start execution', err);
        toast({
          title: 'Failed to start execution',
          description: err instanceof Error ? err.message : 'Unexpected error',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [prompt, projectId, variant, toast, onOpenChange, onSuccess]
  );

  const variants = selectedProfile?.variants ?? [];
  const hasVariants = variants.length > 0;
  const hasExplicitDefault = variants.some(
    (item) => item.label.toLowerCase() === 'default'
  );
  const displayVariants = useMemo(() => {
    if (!hasVariants) return [];
    const entries = [...variants];
    if (!hasExplicitDefault) {
      entries.unshift({ label: 'default' });
    }
    return entries;
  }, [variants, hasVariants, hasExplicitDefault]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Start New Chat</DialogTitle>
        <DialogDescription>
          Provide an initial prompt to launch a new execution for this project.
        </DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="prompt"
            >
              Prompt
            </label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe what you would like the assistant to do"
              rows={6}
              disabled={loading}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {hasVariants && (
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="variant"
              >
                Variant
              </label>
              <Select
                value={variant ?? undefined}
                onValueChange={(value) =>
                  setVariant(
                    value.toLowerCase() === 'default' && !hasExplicitDefault
                      ? null
                      : value
                  )
                }
                disabled={loading}
              >
                <SelectTrigger id="variant">
                  <SelectValue placeholder="Select variant" />
                </SelectTrigger>
                <SelectContent>
                  {displayVariants.map((item) => (
                    <SelectItem key={item.label} value={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !prompt.trim()}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </span>
              ) : (
                'Start'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
