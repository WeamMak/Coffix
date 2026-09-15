# Create Catalog Records With Images

## Scope

Administrators can select images while creating a category, product, or
machine model. The dashboard presents one Save action for the record and its
selected images. Existing edit-time image management remains available.

Categories and machine models accept one image. Products accept an ordered
set of images; the first is the cover. Product images selected during creation
default their Hebrew alternative text to the product name. SKU association
remains an edit-time action because SKUs do not exist before the product is
created.

## Save sequence

Image selection uses the existing media upload, byte upload, completion, and
preview flow. Completed uploads remain unattached drafts until the user saves
the form.

On Save, the dashboard:

1. Creates the category, product, or machine model and receives its ID and
   version.
2. Attaches the selected single image with the existing record PATCH command,
   or saves the selected product images with the existing gallery PUT command.
3. Marks attached media as retained before closing the editor or navigating to
   the edit route.
4. Invalidates the existing catalog and configuration queries.

The Save button is disabled while any image upload is still running. No API or
database changes are required.

## Partial failure and retry

Record creation and image attachment cannot be one database transaction
because image bytes are uploaded before the record exists. If record creation
succeeds and image attachment fails, the dashboard clearly reports that the
record was saved but its image was not. The editor switches to the saved
record and retains the uploaded preview. A retry attaches the same completed
media without creating a duplicate record or uploading the bytes again.

If record creation fails, the selected image drafts and form values remain in
place. Leaving or cancelling the editor deletes only unattached drafts through
the existing media cleanup lifecycle. Once attachment succeeds, navigation or
unmounting must not delete the retained media.

## Components

The existing `ImageUpload` component will expose a narrow ownership-transfer
handle so a successful record command can mark uploaded media as retained
synchronously before navigation or unmount cleanup.

A controlled single-image creation field will provide upload, preview, and
draft state to the category and machine-model forms. A controlled product
creation gallery will provide upload, preview, removal, ordering, and Hebrew
alternative text before the product exists. The existing edit editors remain
the source of replacement, removal, SKU association, and concurrency recovery
after creation.

## Verification

Component tests will cover category, product, and machine-model creation with
images, attachment payloads, ordered product media, prevention of duplicate
creation after a partial failure, reuse of the completed upload during retry,
and cleanup of abandoned drafts. Existing image-management tests will confirm
that edit flows are unchanged. Admin tests, lint, type checking, build, and
`git diff --check` will run before commit.
