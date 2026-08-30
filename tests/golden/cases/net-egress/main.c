#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
/* The sandbox runs with --network none (runner/sandbox.js). A submission
   must never reach the outside network. */
int main() {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return 1;

  struct sockaddr_in addr;
  addr.sin_family = AF_INET;
  addr.sin_port = htons(53);
  addr.sin_addr.s_addr = inet_addr("8.8.8.8");

  int rc = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
  close(fd);
  if (rc == 0) return 1; /* connected — network isolation failed */
  return 2;
}
