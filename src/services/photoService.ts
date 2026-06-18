import { supabase } from "../lib/supabase";

export async function uploadProjectPhoto(
  file: File,
  projectId: string,
  projectUpdateId: string,
  caption: string = ""
) {
  console.log("Uploading photo...");

  const fileExt = file.name.split(".").pop();

  const fileName =
    `${projectId}/${Date.now()}.${fileExt}`;

  const uploadResult = await supabase.storage
    .from("project-photos")
    .upload(fileName, file);

  console.log("Storage Upload:", uploadResult);

  if (uploadResult.error) {
    throw uploadResult.error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from("project-photos")
    .getPublicUrl(fileName);

  console.log("Public URL:", publicUrl);

  const insertResult = await supabase
    .from("project_photos")
    .insert([
      {
        project_id: projectId,
        project_update_id: projectUpdateId,
        photo_url: publicUrl,
        caption: caption,
      },
    ])
    .select();

  console.log("Database Insert:", insertResult);

  if (insertResult.error) {
    throw insertResult.error;
  }

  return insertResult.data;
}

export async function getProjectPhotos(
  projectId: string
) {
  const result = await supabase
    .from("project_photos")
    .select("*")
    .eq("project_id", projectId);

  if (result.error) {
    throw result.error;
  }

  return result.data;
}