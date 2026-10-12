import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Side A label — shown so it is obvious which game is being scored. */
  playerAName?: string;
  /** Side B label. */
  playerBName?: string;
  /** Called only when the player confirms. */
  onConfirm: () => void;
}

/**
 * Plain-language check before someone scores a game they are not playing in.
 *
 * Replaces the old browser alert ("This is not your game..."), which read like
 * an accusation and made people back out instead of carrying on. The question
 * is neutral, names the two sides, and the buttons say exactly what they do.
 */
export function EnterResultConfirmDialog({
  open,
  onOpenChange,
  playerAName,
  playerBName,
  onConfirm,
}: Props) {
  const matchup =
    playerAName && playerBName && playerAName !== "Unknown" && playerBName !== "Unknown"
      ? `${playerAName} vs ${playerBName}`
      : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Do you want to enter the result for this game?</AlertDialogTitle>
          <AlertDialogDescription>
            {matchup ? `${matchup}. ` : ""}
            You are not one of the players in this game, but you can still enter the score if you
            know how it finished.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Yes, proceed</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
