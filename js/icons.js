// Only Target and Evaluation Type have icons in icons/
const ICONS = {
  target: {
    Point: "icons/target_point.png",
    Global: "icons/target_global.png",
    Cluster: "icons/target_cluster.png",
    Trajectory: "icons/target_trajectory.png",
  },
  evaluationType: {
    "Informal Feedback": "icons/evaluation_informal_feedback.png",
    "Lab Study": "icons/evaluation_quantitative_lab_study.png",
    Quantitative: "icons/evaluation_quantive_functional.png",
  },
};

export function iconFor(fieldKey, label) {
  return ICONS[fieldKey]?.[label] ?? null;
}
