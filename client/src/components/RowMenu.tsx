import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  testId?: string;
  /** Draw a separator above this item. */
  separated?: boolean;
}

/** Always-visible overflow menu that replaces hover-only edit/delete icons. */
export default function RowMenu({ items, label = "More actions", testId }: { items: RowMenuItem[]; label?: string; testId?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testId}
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {items.map((item) => (
          <div key={item.label}>
            {item.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              data-testid={item.testId}
              onSelect={item.onSelect}
              className={item.destructive ? "text-destructive focus:text-destructive" : ""}
            >
              {item.icon && <span className="mr-2 flex">{item.icon}</span>}
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
