import * as R from "ramda";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { Editor } from "@/components/content-editor/editor";
import { useDiscover } from "@/hooks/use-discover";

// The editor as a routed page: /content/<model>/new and
// /content/<model>/<id>. Singletons render it on the model's index
// route instead (without an id). /content/<model>/new?duplicate=<id>
// starts a duplicate of that object.
export function ContentEditorPage() {
  const { model: modelLabel, id } = useParams<{
    model: string;
    id?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateOf = id ? null : searchParams.get("duplicate");
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: modelLabel }));
  const isSingleton = model?.admin.is_singleton ?? false;

  return (
    <Editor
      // A duplicate starts afresh, also when opened from the object's
      // own editor.
      key={duplicateOf ? `duplicate-${duplicateOf}` : "editor"}
      modelLabel={modelLabel!}
      id={id}
      duplicateOf={duplicateOf}
      onDuplicate={(sourceId) =>
        navigate(
          `/content/${modelLabel}/new?duplicate=${encodeURIComponent(sourceId)}`,
        )
      }
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
