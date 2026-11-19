export interface AppToastProps {
  id?: string;
  textId?: string;
  actionId?: string;
  hidden?: boolean;
}

export function AppToast({
  id = 'appToast',
  textId = 'appToastText',
  actionId = 'appToastAction',
  hidden = true,
}: AppToastProps) {
  return (
    <div id={id} className="app-toast" role="status" aria-live="polite" hidden={hidden}>
      <span id={textId} />
      <button id={actionId} type="button" hidden />
    </div>
  );
}

export default AppToast;
