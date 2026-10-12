import * as R from "ramda";
import { useNavigate, useParams } from "react-router";

import { Editor } from "@/components/content-editor/editor";
import { useDiscover } from "@/hooks/use-discover";

// The editor as a routed page: /content/<model>/new and
// /content/<model>/<id>. Singletons render it on the model's index
// route instead (without an id).
export function ContentEditorPage() {
  const { model: modelLabel, id } = useParams<{
    model: string;
    id?: string;
  }>();
  const navigate = useNavigate();
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: modelLabel }));
  const isSingleton = model?.admin.is_singleton ?? false;

  return (
    <Editor
      modelLabel={modelLabel!}
      id={id}
      onCreated={(createdId) => {
        // Stay in the editor after a save; a create's route becomes
        // the new object's. Singletons live on the index route.
        if (!isSingleton) {
          navigate(`/content/${modelLabel}/${createdId}`, { replace: true });
        }
      }}
      onClose={() => navigate(isSingleton ? "/" : `/content/${modelLabel}`)}
      onDelete={() => navigate(isSingleton ? "/" : `/content/${modelLabel}`)}
    />
  );
}
