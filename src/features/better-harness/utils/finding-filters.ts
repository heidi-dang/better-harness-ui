import { HarnessFinding, HarnessFindingFilterState } from "../types";

export function filterAndSortFindings(
  findings: HarnessFinding[],
  filters: HarnessFindingFilterState
): HarnessFinding[] {
  return findings
    .filter((finding) => {
      // Dimension filter
      if (filters.dimension !== "all" && finding.dimension !== filters.dimension) {
        return false;
      }

      // Priority filter
      if (filters.priority !== "all" && finding.priority !== filters.priority) {
        return false;
      }

      // Status filter
      if (filters.status !== "all" && finding.status !== filters.status) {
        return false;
      }

      // Vehicle filter
      if (
        filters.recommendedVehicle !== "all" &&
        finding.recommendedVehicle !== filters.recommendedVehicle
      ) {
        return false;
      }

      // Search query
      if (filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        const inTitle = finding.title.toLowerCase().includes(query);
        const inCause = finding.cause.toLowerCase().includes(query);
        const inId = finding.id.toLowerCase().includes(query);
        const inVehicle = finding.recommendedVehicle.toLowerCase().includes(query);
        const inPaths = finding.allowedPaths.some((p) => p.toLowerCase().includes(query));
        if (!inTitle && !inCause && !inId && !inVehicle && !inPaths) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      if (filters.sortBy === "priority") {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        comparison = priorityWeight[b.priority] - priorityWeight[a.priority];
      } else if (filters.sortBy === "status") {
        const statusWeight = {
          regressed: 6,
          processing: 5,
          pending: 4,
          planning: 3,
          fixed: 2,
          ignored: 1,
        };
        comparison = statusWeight[b.status] - statusWeight[a.status];
      } else if (filters.sortBy === "dimension") {
        comparison = a.dimension.localeCompare(b.dimension);
      } else if (filters.sortBy === "recent") {
        comparison = new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      } else if (filters.sortBy === "title") {
        comparison = a.title.localeCompare(b.title);
      }

      return filters.sortOrder === "desc" ? comparison : -comparison;
    });
}
