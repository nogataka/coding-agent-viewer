import { useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Project } from 'shared/types.ts';
import { cn } from '@/lib/utils';

type Props = {
  project: Project;
  isFocused: boolean;
};

function ProjectCard({
  project,
  isFocused,
}: Props) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ref.current.focus();
    }
  }, [isFocused]);

  const createdAt = new Date(project.created_at).toLocaleDateString();
  const updatedAt = new Date(project.updated_at).toLocaleString();

  return (
    <Card
      ref={ref}
      tabIndex={isFocused ? 0 : -1}
      onClick={() => navigate(`/projects/${project.id}/tasks`)}
      className={cn(
        'group border bg-card shadow-sm transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer',
        isFocused && 'ring-2 ring-primary/70'
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {project.git_repo_path}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created {createdAt}
            </span>
            <span aria-hidden="true">•</span>
            <span className="truncate max-w-[140px]">Updated {updatedAt}</span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/projects/${project.id}/tasks`);
            }}
          >
            View Tasks
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ProjectCard;
