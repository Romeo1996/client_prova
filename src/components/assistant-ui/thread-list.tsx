import { useSidebar } from "src/components/ui/sidebar";
import { Button } from "src/components/ui/button";
import { Skeleton } from "src/components/ui/skeleton";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import {
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { Separator } from "src/components/ui/separator";
import type { FC } from "react";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-1">
      <div className="px-1 pt-1 pb-2">
        <ThreadListNew />
      </div>
      <Separator className="mb-1" />
      <AuiIf condition={(s) => s.threads.isLoading}>
        <ThreadListSkeleton />
      </AuiIf>
      <AuiIf condition={(s) => !s.threads.isLoading}>
        <ThreadListPrimitive.Items>
          {() => <ThreadListItem />}
        </ThreadListPrimitive.Items>
      </AuiIf>
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <ThreadListPrimitive.New render={<Button variant="outline" className="aui-thread-list-new h-9 cursor-pointer justify-start gap-2 rounded-lg px-3 text-sm shadow-sm transition-all duration-150 hover:bg-muted data-active:bg-muted" onClick={() => { if (isMobile) setOpenMobile(false); }} />}><PlusIcon className="size-4" />New Thread
            </ThreadListPrimitive.New>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex h-9 items-center px-3"
        >
          <Skeleton className="aui-thread-list-skeleton h-4 w-full" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItem: FC = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group flex h-9 cursor-pointer items-center gap-2 rounded-lg transition-all duration-150 hover:bg-sidebar-accent/60 focus-visible:bg-sidebar-accent/60 focus-visible:outline-none data-active:bg-sidebar-accent">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center px-3 text-start text-sm" onClick={() => { if (isMobile) setOpenMobile(false); }}>
        <span className="aui-thread-list-item-title min-w-0 flex-1 truncate">
          <ThreadListItemPrimitive.Title fallback="New Chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC = () => {
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger render={<Button variant="ghost" size="icon" className="aui-thread-list-item-more me-2 size-7 p-0 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:scale-110 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:opacity-100 group-data-active:opacity-100" />}><MoreHorizontalIcon className="size-4" /><span className="sr-only">More options</span></ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemPrimitive.Delete render={<ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-muted-foreground text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus:bg-sidebar-accent focus:text-sidebar-foreground" />}><TrashIcon className="size-4" />Delete
                        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
