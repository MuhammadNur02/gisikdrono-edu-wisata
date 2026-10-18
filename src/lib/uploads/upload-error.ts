// A refusal from api/uploads/{sign,finalize} that the uploader shows as it is: the server's own Indonesian
// message (copy.uploads.problems), such as how to save an iPhone photo as JPG.
export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}
