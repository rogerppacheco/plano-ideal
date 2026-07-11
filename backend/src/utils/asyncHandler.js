/** Encaminha rejeições de handlers async para o middleware de erro do Express 4. */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
