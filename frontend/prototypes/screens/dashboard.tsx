// The dashboard: a greeting and a grid of widgets.
import type { ReactNode } from "react";
import {
  PiArrowRightBold,
  PiCalendarBlankBold,
  PiClockBold,
  PiPlayCircleBold,
  PiTrendDownBold,
  PiTrendUpBold,
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { PageBody, StatusBadge, UserAvatar } from "../components";
import { activity, articles, me, type ScheduledTask, tasks } from "../data";

export function DashboardScreen() {
  return (
    <PageBody className="pt-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {`Good morning, ${me.name.split(" ")[0]} 👋`}
        </h1>
        <div className="text-muted-foreground mt-1">
          Tuesday 28 October · 2 articles waiting for review
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        <Statistic
          title="Articles"
          value="128"
          trend="+12%"
          sentiment="positive"
        />
        <Statistic
          title="Published this week"
          value="9"
          trend="+2"
          sentiment="positive"
        />
        <Statistic title="Drafts" value="14" trend="-3" sentiment="positive" />
        <Statistic title="Media files" value="231" />

        <Widget
          title="Latest articles"
          description="The five most recently created articles"
          action={<ViewAll href="#/content/articles" />}
          className="md:col-span-2"
        >
          <ul>
            {articles.slice(0, 5).map((article) => (
              <li key={article.id}>
                <a
                  href="#/content/articles/1"
                  className="flex items-center gap-3 px-4 py-2.5 border-t hover:bg-accent"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{article.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {article.author.name.split(" ")[0]} ·{" "}
                      {article.publishedAt ?? "Not published"}
                    </div>
                  </div>
                  <StatusBadge status={article.status} />
                </a>
              </li>
            ))}
          </ul>
        </Widget>

        <Widget
          title="Activity"
          description="Recent changes by the editors"
          className="md:col-span-2"
        >
          <ul>
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 px-4 py-2.5 border-t"
              >
                <UserAvatar user={entry.user} className="size-7" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    <span className="font-medium">
                      {entry.user.name.split(" ")[0]}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {entry.action}
                    </span>{" "}
                    {entry.action === "deleted" ? (
                      <span>{entry.object}</span>
                    ) : (
                      <a
                        href="#/content/articles/1"
                        className="font-medium hover:underline"
                      >
                        {entry.object}
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.model} · {entry.when}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Widget>

        <Widget
          title="Scheduled tasks"
          description="Background jobs and their last run"
          className="md:col-span-2"
        >
          <ul>
            {tasks.map((task) => (
              <li key={task.title} className="px-4 py-3 border-t space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{task.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {task.description}
                    </div>
                  </div>
                  <TaskStatus status={task.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {task.lastRun && (
                    <span className="inline-flex items-center gap-1">
                      <PiClockBold />
                      {task.lastRun}
                    </span>
                  )}
                  {task.duration && (
                    <span className="inline-flex items-center gap-1">
                      <PiPlayCircleBold />
                      {task.duration}
                    </span>
                  )}
                  {task.nextRun && (
                    <span className="inline-flex items-center gap-1">
                      <PiCalendarBlankBold />
                      {`Next ${task.nextRun}`}
                    </span>
                  )}
                </div>
                {task.error && (
                  <div className="text-xs text-destructive">{task.error}</div>
                )}
              </li>
            ))}
          </ul>
        </Widget>

        <Widget
          title="Waiting for review"
          description="Articles that need a second pair of eyes"
          action={<ViewAll href="#/content/articles" />}
          className="md:col-span-2"
        >
          <ul>
            {articles
              .filter((article) => article.status === "review")
              .map((article) => (
                <li key={article.id}>
                  <a
                    href="#/content/articles/1"
                    className="flex items-center gap-3 px-4 py-2.5 border-t hover:bg-accent"
                  >
                    <UserAvatar user={article.author} className="size-7" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {article.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {article.excerpt}
                      </div>
                    </div>
                    <PiArrowRightBold className="text-muted-foreground size-3.5 shrink-0" />
                  </a>
                </li>
              ))}
          </ul>
        </Widget>
      </div>
    </PageBody>
  );
}

function Widget({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card shadow-xs overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground -mr-1.5"
      asChild
    >
      <a href={href}>
        View all
        <PiArrowRightBold />
      </a>
    </Button>
  );
}

function Statistic({
  title,
  value,
  trend,
  sentiment = "default",
}: {
  title: string;
  value: string;
  trend?: string;
  sentiment?: "default" | "positive" | "negative";
}) {
  const down = trend?.startsWith("-");

  return (
    <section className="rounded-lg border bg-card shadow-xs p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <div className="text-3xl font-semibold tabular-nums leading-none">
          {value}
        </div>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium mb-0.5",
              {
                "text-success": sentiment === "positive",
                "text-destructive": sentiment === "negative",
                "text-muted-foreground": sentiment === "default",
              },
            )}
          >
            {down ? <PiTrendDownBold /> : <PiTrendUpBold />}
            {`${trend} this month`}
          </span>
        )}
      </div>
    </section>
  );
}

function TaskStatus({ status }: { status: ScheduledTask["status"] }) {
  const labels: Record<ScheduledTask["status"], string> = {
    RUNNING: "Running",
    SCHEDULED: "Scheduled",
    SUCCESS: "Succeeded",
    FAILURE: "Failed",
  };

  return (
    <Badge variant="secondary" className="gap-1.5 pl-1.5 shrink-0">
      {status === "RUNNING" ? (
        <Spinner className="size-3" />
      ) : (
        <span
          className={cn("size-1.5 rounded-full", {
            "bg-success": status === "SUCCESS",
            "bg-destructive": status === "FAILURE",
            "bg-muted-foreground/60": status === "SCHEDULED",
          })}
        />
      )}
      {labels[status]}
    </Badge>
  );
}
