import PostView from "../../post/PostView";

export default async function PostModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostView postId={id} asModal />;
}
